#!/bin/sh

set -e

if [ "$ERA_MODE" = dev ]; then
    flags="--reload --timeout 3600"
    export ERA_MODE=dev
else
    flags="-t 600 -w $(( $(nproc) * 2 + 1))"
fi
python -c 'from openera.db import init_db; init_db()'
gunicorn $flags --bind 0.0.0.0:8000 openera.server:app
