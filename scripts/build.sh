#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python -m pip install -r requirements.txt
npm --prefix frontend ci
npm --prefix frontend run build
python backend/manage.py collectstatic --noinput
