"""doctor: key presence, model listing and price comparison, with no network."""

from pathlib import Path

import httpx
import pytest

from first_edit.doctor import run_doctor

SECRET = "sk-test-do-not-print-0123456789"

MODELS_TOML = """
[[model]]
id = "mock-reference"
provider = "mock"

[[model]]
id = "cheap"
provider = "openai-compatible"
base_url = "https://api.example.test/v1"
api_key_env = "TEST_KEY"
model = "vendor/cheap"
params = { max_tokens = 32000 }
price = { input = 0.10, output = 0.50 }
"""


def listing(prompt: str = "0.0000001", completion: str = "0.0000005", model_id: str = "vendor/cheap", **extra) -> dict:
    return {"data": [{
        "id": model_id,
        "context_length": 200000,
        "top_provider": {"max_completion_tokens": 64000},
        "pricing": {"prompt": prompt, "completion": completion, "request": "0", **extra},
    }]}


def doctor(tmp_path: Path, handler, environ=None, toml: str = MODELS_TOML) -> tuple[int, str, list[httpx.Request]]:
    models_file = tmp_path / "models.toml"
    models_file.write_text(toml, encoding="utf-8")
    requests: list[httpx.Request] = []

    def record(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return handler(request)

    lines: list[str] = []
    with httpx.Client(transport=httpx.MockTransport(record)) as client:
        code = run_doctor(environ={"TEST_KEY": SECRET} if environ is None else environ, client=client,
                          models_file=models_file, out=lines.append)
    return code, "\n".join(lines), requests


def test_a_listed_model_with_matching_prices_is_usable(tmp_path: Path) -> None:
    code, output, requests = doctor(tmp_path, lambda request: httpx.Response(200, json=listing()))
    assert code == 0
    assert "TEST_KEY: set" in output
    assert "listed (context 200000, max output 64000)" in output
    assert "configured   0.10  listed   0.10  same" in output
    assert "configured   0.50  listed   0.50  same" in output
    assert "every configured model is usable" in output
    assert [str(request.url) for request in requests] == ["https://api.example.test/v1/models"]
    # The key is sent to the endpoint but never printed.
    assert requests[0].headers["Authorization"] == f"Bearer {SECRET}"
    assert SECRET not in output


def test_a_missing_key_makes_the_model_unusable(tmp_path: Path) -> None:
    code, output, requests = doctor(tmp_path, lambda request: httpx.Response(200, json=listing()), environ={})
    assert code == 1
    assert "TEST_KEY: NOT SET" in output
    assert "unusable: cheap" in output
    assert "Authorization" not in requests[0].headers


def test_an_unlisted_model_is_unusable(tmp_path: Path) -> None:
    code, output, _ = doctor(tmp_path, lambda request: httpx.Response(200, json=listing(model_id="vendor/other")))
    assert code == 1
    assert "NOT LISTED at https://api.example.test/v1/models" in output


def test_a_higher_listed_price_is_flagged_and_unusable(tmp_path: Path) -> None:
    code, output, _ = doctor(tmp_path, lambda request: httpx.Response(200, json=listing(completion="0.0000006")))
    assert code == 1
    assert "configured   0.50  listed   0.60  DIFFERENT: listed is HIGHER" in output


def test_a_lower_listed_price_is_flagged_but_usable(tmp_path: Path) -> None:
    code, output, _ = doctor(tmp_path, lambda request: httpx.Response(200, json=listing(prompt="0.00000005")))
    assert code == 0
    assert "configured   0.10  listed   0.05  DIFFERENT: listed is lower" in output


def test_extra_listed_prices_and_a_large_max_tokens_are_noted(tmp_path: Path) -> None:
    body = listing(internal_reasoning="0.000001")
    body["data"][0]["top_provider"]["max_completion_tokens"] = 16000
    code, output, _ = doctor(tmp_path, lambda request: httpx.Response(200, json=body))
    assert code == 0
    assert "other listed prices, not in the budget estimate: internal_reasoning=0.000001" in output
    assert "params max_tokens 32000 is above the listed max output 16000" in output


@pytest.mark.parametrize("handler", [
    lambda request: httpx.Response(500, text="down"),
    lambda request: httpx.Response(200, text="not json"),
])
def test_an_endpoint_failure_makes_the_model_unusable(tmp_path: Path, handler) -> None:
    code, output, _ = doctor(tmp_path, handler)
    assert code == 1
    assert "cannot check" in output


def test_a_connection_error_makes_the_model_unusable(tmp_path: Path) -> None:
    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    code, output, _ = doctor(tmp_path, refuse)
    assert code == 1
    assert "cannot check: ConnectError" in output


def test_the_listing_follows_next_links_and_is_fetched_once_per_base_url(tmp_path: Path) -> None:
    toml = MODELS_TOML + """
[[model]]
id = "cheap-two"
provider = "openai-compatible"
base_url = "https://api.example.test/v1"
api_key_env = "TEST_KEY"
model = "vendor/cheap"
"""
    pages = {
        "/v1/models": {"data": [], "links": {"next": "/v1/models?offset=1"}},
        "/v1/models?offset=1": listing(),
    }
    code, output, requests = doctor(tmp_path, lambda request: httpx.Response(200, json=pages[request.url.raw_path.decode()]),
                                    toml=toml)
    assert code == 0
    assert [request.url.raw_path.decode() for request in requests] == ["/v1/models", "/v1/models?offset=1"]
    assert output.count("result     usable") == 3


def test_a_mock_model_needs_no_network(tmp_path: Path) -> None:
    toml = '[[model]]\nid = "mock-reference"\nprovider = "mock"\n'
    code, output, requests = doctor(tmp_path, lambda request: httpx.Response(500), toml=toml)
    assert (code, requests) == (0, [])
    assert "mock-reference: mock, no network" in output


def test_an_invalid_models_file_exits_2(tmp_path: Path) -> None:
    code, output, _ = doctor(tmp_path, lambda request: httpx.Response(200, json=listing()),
                             toml='[[model]]\nid = "Bad Id"\nprovider = "mock"\n')
    assert code == 2
    assert "INVALID" in output
