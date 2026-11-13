"""export-site: the results site's data is complete, deterministic and holds
no key, no email address outside the reserved example domains and no
absolute local path."""

from __future__ import annotations

import hashlib
import io
import json
import shutil
from pathlib import Path

import pytest
from PIL import Image

from labelfixtures import add_run

from first_edit.paths import REPO_ROOT
from first_edit.providers import SetupError
from first_edit.site_export import SURVIVED_SAMPLE, export_site, privacy_problems, scrub
from first_edit.summarize import build_summary, load_candidates, rounded

FAILED = {"text-long": ["content-spill"], "text-longword@320": ["text-clipped", "page-overflow-x"]}
SOURCE = "export default function Card() {\n  return <div>card</div>;\n}\n"
KEY = "sk-or-v1-0123456789abcdef0123456789abcdef"


def _real_pngs(folder: Path) -> None:
    """add_run writes placeholder bytes; make every screenshot a real PNG."""
    for n, path in enumerate(sorted(folder.rglob("*.png"))):
        width = 1400 if path.name == "text-longword@320.png" else 40 + n % 7
        Image.new("RGB", (width, 30), ((n * 37) % 256, 120, 200)).save(path)


def _world(root: Path) -> dict[str, Path]:
    runs, candidates, briefs, refs = root / "runs", root / "candidates", root / "briefs", root / "refs"
    add_run(runs, "m1/brief-a/plain-s1", failed=FAILED)
    crash_dir = add_run(runs, "m1/brief-a/hinted-s1", baseline_status="render-error")
    (crash_dir / "baseline.json").write_text(json.dumps({
        "status": "render-error",
        "error": f"ReferenceError: tsx is not defined at file:///{REPO_ROOT.as_posix()}/candidates/x.tsx:3 "
                 "(from C:\\Users\\someone\\cache\\y.js)"}), encoding="utf-8")
    _real_pngs(runs)
    for cid in ("m1/brief-a/plain-s1", "m1/brief-a/hinted-s1"):
        folder = candidates / cid
        folder.mkdir(parents=True)
        (folder / "generation.json").write_text(json.dumps({
            "valid": True, "status": "ok", "receivedAt": "2026-11-13T00:00:00+00:00", "reportedModel": "m1-x"}),
            encoding="utf-8")
        (folder / "Component.tsx").write_text(SOURCE, encoding="utf-8")
    brief = briefs / "brief-a"
    brief.mkdir(parents=True)
    (brief / "meta.json").write_text(json.dumps({"id": "brief-a", "title": "Brief A", "category": "card",
                                                 "sample": False}), encoding="utf-8")
    (brief / "brief.md").write_text("A card.\n", encoding="utf-8")
    (brief / "props.ts").write_text("export interface Props { email: string }\n", encoding="utf-8")
    (brief / "fixture.baseline.json").write_text('{"email": "priya.raman@example.com"}\n', encoding="utf-8")
    reference = refs / "brief-a" / "_reference__brief-a__v1"
    reference.mkdir(parents=True)
    Image.new("RGB", (64, 32), (10, 20, 30)).save(reference / "baseline.png")

    found = load_candidates(["m1"], ["brief-a"], candidates_dir=candidates, runs_dir=runs)
    summary = build_summary(found, ["m1"], ["brief-a"], {"m1": {"provider": "mock", "model": "m1-x"}}, finished=[])
    (root / "run").mkdir()
    (root / "run" / "summary.json").write_text(json.dumps(rounded(summary)), encoding="utf-8")
    (root / "cal").mkdir()
    (root / "cal" / "summary.json").write_text(json.dumps({"schemaVersion": 2, "set": "set-t", "labellers": 1}),
                                               encoding="utf-8")
    (root / ".env").write_text(f"OPENROUTER_API_KEY={KEY}\n", encoding="utf-8")
    return {"root": root, "runs": runs, "candidates": candidates, "briefs": briefs, "refs": refs}


def _export(world: dict[str, Path], out: Path) -> dict[str, int]:
    root = world["root"]
    return export_site(root / "run", world["runs"], root / "cal", out, references_dir=world["refs"],
                       candidates_dir=world["candidates"], briefs_dir=world["briefs"], env_file=root / ".env")


@pytest.fixture(scope="module")
def exported(tmp_path_factory) -> tuple[dict[str, Path], Path]:
    world = _world(tmp_path_factory.mktemp("world"))
    out = world["root"] / "site" / "data"
    _export(world, out)
    return world, out


def _read(out: Path, name: str) -> dict:
    return json.loads((out / name).read_text(encoding="utf-8"))


def _digests(folder: Path) -> dict[str, str]:
    return {path.relative_to(folder).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in sorted(folder.rglob("*")) if path.is_file()}


def test_the_export_holds_the_failed_cases_the_crash_and_a_survived_sample(exported) -> None:
    _, out = exported
    data = _read(out, "cases.json")
    assert data["counts"] == {"failed": 2, "survived": 17, "born-broken": 0, "baseline-crash": 1}
    assert data["survivedSample"] == {"seed": 1, "size": min(SURVIVED_SAMPLE, 17), "of": 17}
    by_id = {case["id"]: case for case in data["cases"]}
    assert len(by_id) == 2 + 17 + 1
    failed = by_id["m1/brief-a/plain-s1/text-longword@320"]
    assert failed["outcome"] == "failed" and failed["tier"] == "core"
    assert failed["checks"] == ["page-overflow-x", "text-clipped"]
    assert failed["description"] == "a 30-letter word, phone width"
    assert [finding["check"] for finding in failed["findings"]] == ["text-clipped", "page-overflow-x"]
    images = failed["images"]
    assert images["before"]["src"] == "images/m1/brief-a/plain-s1/viewport-320.webp"
    assert images["after"]["src"] == "images/m1/brief-a/plain-s1/text-longword-320.webp"
    assert images["annotated"]["src"].endswith("text-longword-320.annotated.webp")
    # at most 1280 px wide, with the scale that maps page pixels onto the picture
    assert images["after"]["width"] == 1280 and images["after"]["scale"] == round(1280 / 1400, 4)
    for picture in images.values():
        assert (out / picture["src"]).is_file()
        with Image.open(out / picture["src"]) as image:
            assert image.format == "WEBP" and image.size == (picture["width"], picture["height"])
    assert by_id["m1/brief-a/plain-s1/text-long"]["images"]["before"]["src"].endswith("/baseline.webp")
    assert (out / failed["source"]).read_text(encoding="utf-8") == SOURCE
    crash = by_id["m1/brief-a/hinted-s1/baseline"]
    assert crash["outcome"] == "baseline-crash" and crash["images"]["before"] is None


def test_errors_lose_every_local_path(exported) -> None:
    _, out = exported
    crash = next(case for case in _read(out, "cases.json")["cases"] if case["outcome"] == "baseline-crash")
    assert crash["error"] == "ReferenceError: tsx is not defined at candidates/x.tsx:3 (from <local path>)"
    assert scrub(f"{REPO_ROOT}\\harness\\a.ts and D:/elsewhere/b.ts") == "harness\\a.ts and <local path>"


def test_the_run_data_says_which_models_have_finished_and_gives_intervals(exported) -> None:
    _, out = exported
    run = _read(out, "run.json")
    assert run["status"] == {"finished": [], "models": 1, "preliminary": True}
    assert run["models"][0]["finished"] is False
    group = run["groups"][0]
    assert group["model"] == "m1" and group["brokeOnce"]["core"]["ci95"] is not None
    longword = group["failedByCase"]["text-longword@320"]
    assert longword["failed"] == 1 and longword["applicable"] == 1 and longword["rate"] == 1.0
    assert longword["ci95"] == [0.2065, 1.0]
    assert next(case for case in run["cases"] if case["id"] == "list-0")["description"] == "empty lists"


def test_the_briefs_carry_the_prompt_word_for_word_and_the_reference(exported) -> None:
    _, out = exported
    data = _read(out, "briefs.json")
    assert set(data["prompt"]) == {"system", "user", "hint"} and "{brief}" in data["prompt"]["user"]
    brief = data["briefs"][0]
    assert (brief["id"], brief["title"], brief["brief"]) == ("brief-a", "Brief A", "A card.\n")
    assert brief["fixture"] == '{"email": "priya.raman@example.com"}\n'
    assert (out / brief["reference"]["src"]).is_file()
    assert _read(out, "calibration.json") == {"schemaVersion": 2, "set": "set-t", "labellers": 1}


def test_the_export_is_deterministic(exported, tmp_path: Path) -> None:
    world, out = exported
    again = tmp_path / "again"
    _export(world, again)
    assert _digests(again) == _digests(out)


def test_the_export_contains_no_key_email_or_local_path(exported) -> None:
    world, out = exported
    assert privacy_problems(out, env_file=world["root"] / ".env", extra=(str(world["root"]),)) == []


def test_the_scanner_finds_what_must_not_be_published(tmp_path: Path) -> None:
    (tmp_path / ".env").write_text("SOME_KEY=a-secret-value-123\n", encoding="utf-8")
    folder = tmp_path / "data"
    folder.mkdir()
    (folder / "a.json").write_text(json.dumps({
        "fine": ["priya.raman@example.compriya.raman@ex", "text-long@320", "risk-management-dashboard-panel"],
        "key": KEY, "env": "a-secret-value-123", "mail": "someone@gmail.com",
        "windows": "C:\\Users\\someone\\x", "posix": "/home/someone/x", "url": "file:///D:/x",
        "header": "Authorization: Bearer abc123def456ghi789jkl012"}), encoding="utf-8")
    buffer = io.BytesIO()
    exif = Image.Exif()
    exif[0x013B] = "an artist"
    Image.new("RGB", (8, 8)).save(buffer, "WEBP", exif=exif)
    (folder / "b.webp").write_bytes(buffer.getvalue())
    (folder / "c.exe").write_bytes(b"MZ")
    problems = "\n".join(privacy_problems(folder, env_file=tmp_path / ".env"))
    for expected in ("something like an API key (sk-or-v1-012", "the value of a variable in .env",
                     "an email address at gmail.com", "an absolute local path ('C:",
                     "an absolute local path ('/home/", "an absolute local path ('file:///",
                     "b.webp: image chunks EXIF", "c.exe: unexpected file type", "something like an API key (Bearer"):
        assert expected in problems
    assert "example.com" not in problems and "risk-management" not in problems and "@320" not in problems
    shutil.rmtree(folder)
    folder.mkdir()
    (folder / "ok.json").write_text('{"email": "lucas.silva@example.com"}', encoding="utf-8")
    assert privacy_problems(folder, env_file=tmp_path / ".env") == []


def test_an_email_in_a_candidate_source_stops_the_export(tmp_path: Path) -> None:
    world = _world(tmp_path / "world")
    (world["candidates"] / "m1/brief-a/plain-s1/Component.tsx").write_text(
        'export default () => <a href="mailto:owner@realmail.io">mail</a>;\n', encoding="utf-8")
    out = tmp_path / "out"
    with pytest.raises(SetupError, match="an email address at realmail.io"):
        _export(world, out)
    assert not out.exists() and not (tmp_path / "out.export-tmp").exists()


def test_a_folder_that_is_not_an_export_is_never_replaced(tmp_path: Path) -> None:
    world = _world(tmp_path / "world")
    out = tmp_path / "out"
    out.mkdir()
    (out / "notes.txt").write_text("mine", encoding="utf-8")
    with pytest.raises(SetupError, match="not a site export"):
        _export(world, out)
    assert (out / "notes.txt").read_text(encoding="utf-8") == "mine"


def test_a_summary_without_finished_models_is_refused(tmp_path: Path) -> None:
    world = _world(tmp_path / "world")
    summary_file = world["root"] / "run" / "summary.json"
    summary = json.loads(summary_file.read_text(encoding="utf-8"))
    summary["decisions"] = None
    summary_file.write_text(json.dumps(summary), encoding="utf-8")
    with pytest.raises(SetupError, match="summarize --plan"):
        _export(world, tmp_path / "out")


def test_the_committed_site_data_is_clean() -> None:
    data = REPO_ROOT / "site" / "public" / "data"
    if not (data / "run.json").is_file():
        pytest.skip("no site export in site/public/data")
    assert privacy_problems(data) == []
    run = json.loads((data / "run.json").read_text(encoding="utf-8"))
    cases = json.loads((data / "cases.json").read_text(encoding="utf-8"))
    for case in cases["cases"]:
        for picture in case["images"].values():
            assert picture is None or (data / picture["src"]).is_file()
    assert run["status"]["models"] == len(run["models"])
