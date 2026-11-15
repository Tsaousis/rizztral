#!/usr/bin/env bash
# Builds the React app and publishes only the static output to the Hugging Face Space.
# Requires: npm, python3 with huggingface_hub, and a logged-in HF write token.
set -euo pipefail

SPACE="${SPACE:-Mistral-AI-Game-Jam/Rizztral}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT/frontend"
npm ci
npm run build

sed -e '/^app_build_command:/d' -e 's|^app_file:.*|app_file: index.html|' "$ROOT/README.md" > dist/README.md

SPACE="$SPACE" python3 - <<'PY'
import os
from huggingface_hub import HfApi

api = HfApi()
space = os.environ["SPACE"]
api.upload_folder(
    repo_id=space,
    repo_type="space",
    folder_path="dist",
    delete_patterns=["*"],
    commit_message="Deploy static frontend",
)
print(api.get_space_runtime(space))
PY
