"""Repository paths used by the runner."""

from pathlib import Path

PACKAGE_DIR = Path(__file__).resolve().parent
RUNNER_DIR = PACKAGE_DIR.parent
REPO_ROOT = RUNNER_DIR.parent

BRIEFS_DIR = REPO_ROOT / "briefs"
CANDIDATES_DIR = REPO_ROOT / "candidates"
HARNESS_DIR = REPO_ROOT / "harness"
RESULTS_DIR = REPO_ROOT / "results"
CACHE_DIR = RESULTS_DIR / "cache"
RUNS_DIR = RESULTS_DIR / "runs"

MODELS_FILE = RUNNER_DIR / "models.toml"
PROMPTS_DIR = PACKAGE_DIR / "prompts"
ENV_FILE = REPO_ROOT / ".env"
