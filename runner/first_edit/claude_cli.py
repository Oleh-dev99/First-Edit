"""The claude-cli provider: one sample per run of Claude Code's command line
on the owner's subscription (D-047).

Each sample runs the installed `claude` once, non-interactively: from a new
empty temporary directory outside the repository, in print mode with JSON
output, one turn and no session persistence, with our system prompt
replacing Claude Code's own (--system-prompt-file), every built-in tool and
every MCP tool disabled, a fixed effort, and --safe-mode when the installed
version has it, so CLAUDE.md, skills, plugins, hooks and MCP servers do not
load. The user message goes on stdin, never on the command line. The child
process gets the environment without Claude Code's session variables and
without API keys, so it uses the stored claude.ai login and cannot attach to
a running Claude Code session.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
import time
from collections.abc import Callable, Mapping
from functools import lru_cache
from pathlib import Path
from typing import Any

from .ledger import QuotaExhausted
from .models import ModelEntry
from .providers import Completion, ProviderError, Reply, SetupError

PROVIDER = "claude-cli"
#: Effort levels the command line accepts.
EFFORTS = ("low", "medium", "high", "xhigh", "max")
#: A sample that runs longer than this fails as an API error.
TIMEOUT_SECONDS = 1200
#: Text in a failed reply that means the plan's usage limit is reached.
USAGE_LIMIT = re.compile(r"usage limit|hit your (?:usage )?limit|limit (?:will )?resets?|out of (?:extra )?usage",
                         re.IGNORECASE)
#: Environment variables the child does not get: Claude Code's own session
#: variables (CLAUDECODE, CLAUDE_CODE_*, CLAUDE_EFFORT, ...), Anthropic API
#: settings and every API key. CLAUDE_CONFIG_DIR stays: it locates the login.
_DROPPED_ENV = re.compile(r"^(?!CLAUDE_CONFIG_DIR$)(CLAUDE|ANTHROPIC_)|_API_KEY$", re.IGNORECASE)


class UsageLimitReached(QuotaExhausted):
    """The subscription's usage limit is reached. The sample gets no files."""


def executable() -> str:
    """The `claude` executable on PATH (claude.exe on Windows)."""
    path = shutil.which("claude")
    if path is None:
        raise SetupError("the claude command was not found on PATH (install Claude Code and sign in)")
    return path


def _run(command: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace", check=False,
                          env=child_environment(), **kwargs)


@lru_cache(maxsize=None)
def cli_version(exe: str) -> str:
    """The installed version, e.g. "2.1.229"."""
    result = _run([exe, "--version"], timeout=60)
    match = re.search(r"\d+\.\d+\.\d+", result.stdout)
    if result.returncode != 0 or match is None:
        raise SetupError(f"could not read the claude version: {(result.stderr or result.stdout).strip()[:200]}")
    return match.group(0)


@lru_cache(maxsize=None)
def help_text(exe: str) -> str:
    return _run([exe, "--help"], timeout=60).stdout


def supports_safe_mode(exe: str) -> bool:
    return "--safe-mode" in help_text(exe)


def auth_status(exe: str) -> dict[str, Any]:
    """`claude auth status` as JSON: loggedIn, authMethod, subscriptionType.
    The email and organisation fields are dropped."""
    result = _run([exe, "auth", "status"], timeout=60)
    try:
        status = json.loads(result.stdout)
    except ValueError:
        return {"loggedIn": False, "authMethod": None, "error": (result.stderr or result.stdout).strip()[:200]}
    return {key: status.get(key) for key in ("loggedIn", "authMethod", "apiProvider", "subscriptionType")}


#: Documented switches that keep further context out of the child: reminders
#: and nudges (attachments), CLAUDE.md files and the git status snapshot.
CHILD_SETTINGS = {
    "CLAUDE_CODE_DISABLE_ATTACHMENTS": "1",
    "CLAUDE_CODE_DISABLE_CLAUDE_MDS": "1",
    "CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS": "1",
}


def child_environment(environ: Mapping[str, str] | None = None) -> dict[str, str]:
    """The environment for the child: everything but Claude Code's session
    variables, Anthropic settings and API keys, plus CHILD_SETTINGS."""
    environ = os.environ if environ is None else environ
    kept = {name: value for name, value in environ.items() if not _DROPPED_ENV.search(name)}
    return {**kept, **CHILD_SETTINGS}


def build_command(exe: str, alias: str, system_prompt_file: Path, effort: str, *, safe_mode: bool) -> list[str]:
    """The command line for one sample. The user message is not part of it:
    it goes on stdin."""
    command = [
        exe,
        "--print",
        "--output-format", "json",
        "--max-turns", "1",
        "--no-session-persistence",
        "--model", alias,
        "--system-prompt-file", str(system_prompt_file),
        "--tools", "",
        "--disallowedTools", "mcp__*",
        "--effort", effort,
    ]
    if safe_mode:
        command.append("--safe-mode")
    return command


def _finish_reason(output: dict[str, Any]) -> str | None:
    stop = output.get("stop_reason")
    if stop in ("end_turn", "stop_sequence"):
        return "stop"
    if stop == "max_tokens":
        return "length"
    if isinstance(stop, str):
        return stop
    return "stop" if output.get("subtype") == "success" else output.get("subtype")


def _main_model(model_usage: dict[str, Any]) -> str | None:
    """The model that wrote the reply: the one with the most output tokens."""
    best = None
    for name, usage in model_usage.items():
        tokens = usage.get("outputTokens", 0) if isinstance(usage, dict) else 0
        if best is None or tokens > best[1]:
            best = (name, tokens)
    return best[0] if best else None


def _int(value: Any) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def parse_cli_reply(raw: dict[str, Any]) -> Reply:
    """The reply of a cached claude-cli response: {provider, cliVersion,
    effort, safeMode, output}, where output is the command line's JSON."""
    output = raw.get("output")
    if not isinstance(output, dict):
        raise ProviderError("claude-cli: the response has no JSON output")
    usage = output.get("usage") or {}
    model_usage = output.get("modelUsage") if isinstance(output.get("modelUsage"), dict) else {}
    if model_usage:
        # modelUsage holds the totals of the run; usage can cover only its last request.
        def total(key: str) -> int:
            return sum(_int(entry.get(key)) or 0 for entry in model_usage.values() if isinstance(entry, dict))

        read = total("cacheReadInputTokens")
        input_tokens: int | None = total("inputTokens") + total("cacheCreationInputTokens") + read
        output_tokens: int | None = total("outputTokens")
        cached: int | None = read
    else:
        fresh, created, read_only = (_int(usage.get(key)) for key in
                                     ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"))
        parts = [count for count in (fresh, created, read_only) if count is not None]
        input_tokens, output_tokens, cached = (sum(parts) if parts else None), _int(usage.get("output_tokens")), read_only
    details = usage.get("output_tokens_details") if isinstance(usage.get("output_tokens_details"), dict) else {}
    cost = output.get("total_cost_usd")
    return Reply(
        content=str(output.get("result") or ""),
        finish_reason=_finish_reason(output),
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        reasoning_tokens=_int(details.get("thinking_tokens")),
        cached_input_tokens=cached,
        reported_model=_main_model(model_usage),
        reported_provider="claude-cli",
        # Not billed per call: the subscription covers it. The command line's
        # own figure is kept below, labelled as an estimate.
        reported_cost=None,
        cli={
            "version": raw.get("cliVersion"),
            "effort": raw.get("effort"),
            "safeMode": raw.get("safeMode"),
            "costUsdEstimate": float(cost) if isinstance(cost, (int, float)) and not isinstance(cost, bool) else None,
            "models": sorted(model_usage),
            "numTurns": _int(output.get("num_turns")),
            "durationMs": _int(output.get("duration_ms")),
        },
    )


class ClaudeCliProvider:
    """Runs `claude` once per sample; see the module docstring.

    A reply that reports the plan's usage limit raises UsageLimitReached, so
    the caller stops the job without retrying. Any other failure is a
    ProviderError (an API error, recorded and called again on a later run).
    """

    def __init__(self, entry: ModelEntry, *, exe: str | None = None,
                 run: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
                 environ: Mapping[str, str] | None = None, version: str | None = None,
                 safe_mode: bool | None = None) -> None:
        self.entry = entry
        self.exe = exe or executable()
        self.run = run
        self.environ = environ
        self.effort = str(entry.params.get("effort", "medium"))
        self.version = version if version is not None else cli_version(self.exe)
        self.safe_mode = safe_mode if safe_mode is not None else supports_safe_mode(self.exe)

    def complete(self, messages: list[dict[str, str]], brief: Any) -> Completion:
        system = next(message["content"] for message in messages if message["role"] == "system")
        user = next(message["content"] for message in messages if message["role"] == "user")
        with tempfile.TemporaryDirectory(prefix="first-edit-cli-prompt-") as prompt_dir, \
                tempfile.TemporaryDirectory(prefix="first-edit-cli-run-") as work_dir:
            prompt_file = Path(prompt_dir) / "system.md"
            prompt_file.write_text(system, encoding="utf-8", newline="\n")
            command = build_command(self.exe, self.entry.model or "", prompt_file, self.effort, safe_mode=self.safe_mode)
            started = time.monotonic()
            try:
                result = self.run(command, input=user, cwd=work_dir, env=child_environment(self.environ),
                                  capture_output=True, text=True, encoding="utf-8", errors="replace",
                                  timeout=TIMEOUT_SECONDS, check=False)
            except subprocess.TimeoutExpired as error:
                raise ProviderError(f"claude-cli: no reply within {TIMEOUT_SECONDS} s") from error
        latency = round((time.monotonic() - started) * 1000)
        try:
            output = json.loads(result.stdout)
        except ValueError:
            output = None
        if not isinstance(output, dict):
            text = (result.stderr or result.stdout).strip()
            if USAGE_LIMIT.search(text):
                raise UsageLimitReached(f"claude-cli: usage limit reached: {text[:300]}")
            raise ProviderError(f"claude-cli: exit {result.returncode}, no JSON output: {text[:300]}")
        if output.get("is_error") or result.returncode != 0:
            text = str(output.get("result") or output.get("subtype") or result.stderr).strip()
            if USAGE_LIMIT.search(text):
                raise UsageLimitReached(f"claude-cli: usage limit reached: {text[:300]}")
            raise ProviderError(f"claude-cli: {output.get('subtype') or 'error'}: {text[:300]}")
        raw = {"provider": PROVIDER, "cliVersion": self.version, "effort": self.effort, "safeMode": self.safe_mode,
               "output": output}
        return Completion(raw=raw, latency_ms=latency, attempts=1)
