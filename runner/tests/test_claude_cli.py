"""The claude-cli provider, with a fake executable and no real calls: the
command line built for a sample, the child's environment and directory, and
parsing of the command line's JSON output (D-047)."""

import json
import subprocess
from pathlib import Path

import pytest

from first_edit.claude_cli import (
    CHILD_SETTINGS,
    ClaudeCliProvider,
    UsageLimitReached,
    build_command,
    child_environment,
    parse_cli_reply,
)
from first_edit.models import ModelEntry, ModelsError, load_models
from first_edit.paths import REPO_ROOT
from first_edit.providers import ProviderError, parse_reply

ENTRY = ModelEntry(id="cc-test", provider="claude-cli", model="haiku", params={"effort": "medium"})
MESSAGES = [{"role": "system", "content": "Write one React component."},
            {"role": "user", "content": "Build the pricing table.\n\n## Props interface"}]

#: The command line's JSON output, as `claude -p --output-format json` prints it (fields trimmed).
OUTPUT = {
    "type": "result",
    "subtype": "success",
    "is_error": False,
    "num_turns": 1,
    "stop_reason": "end_turn",
    "duration_ms": 41000,
    "total_cost_usd": 0.0123,
    "result": "```tsx\nexport default function A() { return null; }\n```",
    "usage": {"input_tokens": 10, "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0, "output_tokens": 5,
              "output_tokens_details": {"thinking_tokens": 120}},
    "modelUsage": {"claude-haiku-4-5-20251001": {"inputTokens": 3000, "outputTokens": 900, "cacheReadInputTokens": 200,
                                                 "cacheCreationInputTokens": 100, "costUSD": 0.0123}},
}


class FakeClaude:
    """Stands in for subprocess.run on the claude executable: records the call
    and prints the given output."""

    def __init__(self, stdout: str, returncode: int = 0, stderr: str = "") -> None:
        self.stdout, self.returncode, self.stderr = stdout, returncode, stderr
        self.calls: list[dict] = []

    def __call__(self, command, **kwargs):
        prompt_file = Path(command[command.index("--system-prompt-file") + 1])
        work_dir = Path(kwargs["cwd"])
        self.calls.append({"command": command, "system": prompt_file.read_text(encoding="utf-8"),
                           "work_dir": work_dir, "work_dir_entries": list(work_dir.iterdir()), **kwargs})
        return subprocess.CompletedProcess(command, self.returncode, self.stdout, self.stderr)


def provider(fake: FakeClaude, environ=None) -> ClaudeCliProvider:
    return ClaudeCliProvider(ENTRY, exe="C:/fake/claude.exe", run=fake, environ=environ or {}, version="2.1.229",
                             safe_mode=True)


def test_the_command_line_for_a_sample() -> None:
    command = build_command("C:/fake/claude.exe", "sonnet", Path("C:/tmp/p/system.md"), "medium", safe_mode=True)
    assert command == [
        "C:/fake/claude.exe", "--print", "--output-format", "json", "--max-turns", "1", "--no-session-persistence",
        "--model", "sonnet", "--system-prompt-file", str(Path("C:/tmp/p/system.md")), "--tools", "",
        "--disallowedTools", "mcp__*", "--effort", "medium", "--safe-mode",
    ]
    assert "--safe-mode" not in build_command("claude", "opus", Path("s.md"), "medium", safe_mode=False)


def test_a_sample_runs_in_an_empty_directory_with_the_user_message_on_stdin() -> None:
    fake = FakeClaude(json.dumps(OUTPUT))
    environ = {"PATH": "/bin", "CLAUDECODE": "1", "CLAUDE_CODE_SESSION_ID": "x", "CLAUDE_EFFORT": "max",
               "ANTHROPIC_API_KEY": "secret", "OPENROUTER_API_KEY": "secret", "CLAUDE_CONFIG_DIR": "/cfg"}
    completion = provider(fake, environ).complete(MESSAGES, None)
    call = fake.calls[0]
    # The user message goes on stdin, never on the command line.
    assert call["input"] == MESSAGES[1]["content"] and MESSAGES[1]["content"] not in call["command"]
    # Our system prompt replaces Claude Code's, from a file outside the repository.
    assert call["system"] == MESSAGES[0]["content"]
    assert call["work_dir_entries"] == [] and not call["work_dir"].resolve().is_relative_to(REPO_ROOT)
    assert not call["work_dir"].exists()  # removed after the call
    # No session variables of a running Claude Code and no keys; the login's config dir stays.
    assert call["env"] == {"PATH": "/bin", "CLAUDE_CONFIG_DIR": "/cfg", **CHILD_SETTINGS}
    assert completion.raw == {"provider": "claude-cli", "cliVersion": "2.1.229", "effort": "medium", "safeMode": True,
                              "output": OUTPUT}


def test_parsing_the_json_output() -> None:
    raw = {"provider": "claude-cli", "cliVersion": "2.1.229", "effort": "medium", "safeMode": True, "output": OUTPUT}
    reply = parse_reply(raw)
    assert reply == parse_cli_reply(raw)
    assert reply.content.startswith("```tsx")
    assert (reply.finish_reason, reply.reported_model, reply.reported_provider) == (
        "stop", "claude-haiku-4-5-20251001", "claude-cli")
    # Totals come from modelUsage: input includes cache reads and writes.
    assert (reply.input_tokens, reply.output_tokens, reply.cached_input_tokens, reply.reasoning_tokens) == (3300, 900, 200, 120)
    # Not billed per call: the CLI's figure is kept as an estimate only.
    assert reply.reported_cost is None
    assert reply.cli == {"version": "2.1.229", "effort": "medium", "safeMode": True, "costUsdEstimate": 0.0123,
                         "models": ["claude-haiku-4-5-20251001"], "numTurns": 1, "durationMs": 41000}
    cut = parse_cli_reply({**raw, "output": {**OUTPUT, "stop_reason": "max_tokens"}})
    assert cut.finish_reason == "length"


def test_a_usage_limit_stops_and_other_failures_are_api_errors() -> None:
    limit = {**OUTPUT, "is_error": True, "subtype": "error", "result": "Claude AI usage limit reached|1763089200"}
    with pytest.raises(UsageLimitReached):
        provider(FakeClaude(json.dumps(limit), returncode=1)).complete(MESSAGES, None)
    with pytest.raises(UsageLimitReached):
        provider(FakeClaude("", returncode=1, stderr="You've hit your limit · resets 5pm")).complete(MESSAGES, None)
    with pytest.raises(ProviderError, match="no JSON output"):
        provider(FakeClaude("not json", returncode=1, stderr="boom")).complete(MESSAGES, None)
    overloaded = {**OUTPUT, "is_error": True, "subtype": "error_during_execution", "result": "API Error: 529 Overloaded"}
    with pytest.raises(ProviderError, match="529") as caught:
        provider(FakeClaude(json.dumps(overloaded), returncode=1)).complete(MESSAGES, None)
    assert not isinstance(caught.value, UsageLimitReached)


def test_child_environment_keeps_the_login_and_drops_sessions_and_keys() -> None:
    env = child_environment({"HOME": "/h", "CLAUDECODE": "1", "CLAUDE_CODE_ENTRYPOINT": "cli",
                             "ANTHROPIC_BASE_URL": "x", "MY_API_KEY": "k", "CLAUDE_CONFIG_DIR": "/c"})
    assert env == {"HOME": "/h", "CLAUDE_CONFIG_DIR": "/c", **CHILD_SETTINGS}


def test_models_file_rules_for_claude_cli(tmp_path: Path) -> None:
    def load(body: str):
        path = tmp_path / "models.toml"
        path.write_text(body, encoding="utf-8")
        return load_models(path)

    good = load('[[model]]\nid = "cc-x"\nprovider = "claude-cli"\nmodel = "haiku"\nparams = { effort = "medium" }\n')
    assert good["cc-x"].identity() == {"id": "cc-x", "provider": "claude-cli", "base_url": None, "model": "haiku"}
    for body, message in (
        ('[[model]]\nid = "cc-x"\nprovider = "claude-cli"\nparams = { effort = "medium" }\n', "alias"),
        ('[[model]]\nid = "cc-x"\nprovider = "claude-cli"\nmodel = "haiku"\n', "effort"),
        ('[[model]]\nid = "cc-x"\nprovider = "claude-cli"\nmodel = "haiku"\nparams = { effort = "huge" }\n', "effort"),
        ('[[model]]\nid = "cc-x"\nprovider = "claude-cli"\nmodel = "haiku"\napi_key_env = "K"\n'
         'params = { effort = "medium" }\n', "does not apply"),
    ):
        with pytest.raises(ModelsError, match=message):
            load(body)


def test_generation_json_records_the_cli(tmp_path: Path, run) -> None:
    from conftest import FakeProvider

    raw = {"provider": "claude-cli", "cliVersion": "2.1.229", "effort": "medium", "safeMode": True, "output": OUTPUT}
    run(ENTRY, FakeProvider(raw=raw), ["pricing-table"])
    record = json.loads((tmp_path / "candidates/cc-test/pricing-table/plain-s1/generation.json").read_text(encoding="utf-8"))
    assert record["model"]["provider"] == "claude-cli" and record["model"]["model"] == "haiku"
    assert (record["reportedModel"], record["reportedProvider"]) == ("claude-haiku-4-5-20251001", "claude-cli")
    assert record["usage"] == {"inputTokens": 3300, "cachedInputTokens": 200, "outputTokens": 900, "reasoningTokens": 120}
    assert (record["actualCostUsd"], record["estimatedCostUsd"]) == (None, None)
    assert record["cli"]["costUsdEstimate"] == 0.0123 and record["cli"]["version"] == "2.1.229"
    assert record["cli"]["effort"] == "medium" and record["valid"] is True
