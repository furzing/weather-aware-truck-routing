import os
import sys
from pathlib import Path

from waitress import serve


def main():
    if os.environ.get("RAILWAY_ENVIRONMENT_ID") and not os.environ.get("SECRET_KEY"):
        raise RuntimeError("Set SECRET_KEY in Railway Variables before starting the service.")
    # Work both from the repository root and the Docker image's backend directory.
    backend = Path(__file__).resolve().parents[1] / "backend"
    if backend.is_dir():
        sys.path.insert(0, str(backend))
    from config.wsgi import application

    serve(application, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), threads=6)


if __name__ == "__main__":
    main()
