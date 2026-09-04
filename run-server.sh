#!/usr/bin/env bash
cd "$(dirname "$0")"
source venv/bin/activate
exec uvicorn backend.app:app --host 0.0.0.0 --port 8000 --log-level info
