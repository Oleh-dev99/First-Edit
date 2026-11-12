from pathlib import Path

import pytest

from first_edit.models import ModelsError, get_model, load_models
from first_edit.node import npm


def test_the_models_file_lists_the_mock() -> None:
    entry = get_model("mock-reference")
    assert (entry.provider, entry.params, entry.price) == ("mock", {}, None)


def write(tmp_path: Path, text: str) -> Path:
    path = tmp_path / "models.toml"
    path.write_text(text, encoding="utf-8")
    return path


def test_a_real_entry_is_read(tmp_path: Path) -> None:
    path = write(tmp_path, """
[[model]]
id = "example-model"
provider = "openai-compatible"
base_url = "https://openrouter.ai/api/v1"
api_key_env = "OPENROUTER_API_KEY"
model = "vendor/model"
params = { max_tokens = 16000 }
price = { input = 0.5, output = 1.5 }
""")
    entry = load_models(path)["example-model"]
    assert entry.params == {"max_tokens": 16000}
    assert (entry.price.input, entry.price.output) == (0.5, 1.5)
    assert "OPENROUTER_API_KEY" in str(entry.describe())


@pytest.mark.parametrize("body, message", [
    ('id = "Bad Id"\nprovider = "mock"', "id must match"),
    ('id = "m"\nprovider = "other"', "provider must be one of"),
    ('id = "m"\nprovider = "openai-compatible"', "base_url is required"),
    ('id = "m"\nprovider = "mock"\ncolour = "red"', "unknown keys"),
    ('id = "m"\nprovider = "mock"\nparams = { model = "x" }', "may not set model"),
    ('id = "m"\nprovider = "mock"\nprice = { input = 1 }', "price must be"),
])
def test_malformed_entries_are_rejected(tmp_path: Path, body: str, message: str) -> None:
    with pytest.raises(ModelsError, match=message):
        load_models(write(tmp_path, f"[[model]]\n{body}\n"))


def test_unknown_model_and_duplicates(tmp_path: Path) -> None:
    with pytest.raises(ModelsError, match="unknown model"):
        get_model("nope")
    with pytest.raises(ModelsError, match="listed twice"):
        load_models(write(tmp_path, '[[model]]\nid = "m"\nprovider = "mock"\n[[model]]\nid = "m"\nprovider = "mock"\n'))


def test_npm_is_resolved_without_a_shell() -> None:
    assert Path(npm()).name.lower() in {"npm", "npm.cmd"}
