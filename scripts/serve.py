import logging
import os
import sys
from pathlib import Path

from waitress import serve


def main():
    if os.environ.get("RAILWAY_ENVIRONMENT_ID") and not os.environ.get("SECRET_KEY"):
        raise RuntimeError("Set SECRET_KEY in Railway Variables before starting the service.")
    if os.environ.get("RAILWAY_ENVIRONMENT_ID") and not os.environ.get("SQLITE_PATH"):
        logging.warning(
            "SQLITE_PATH is unset. Mount a persistent volume to retain saved comparisons across Railway deployments."
        )
    # Work both from the repository root and the Docker image's backend directory.
    backend = Path(__file__).resolve().parents[1] / "backend"
    if backend.is_dir():
        sys.path.insert(0, str(backend))
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    import django
    from django.core.management import call_command

    django.setup()
    # Single-instance SQLite deployment; schema failure must stop startup.
    call_command("migrate", interactive=False, verbosity=0)
    call_command("purge_expired_trips", verbosity=0)
    from config.wsgi import application

    serve(application, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), threads=6)


if __name__ == "__main__":
    main()
