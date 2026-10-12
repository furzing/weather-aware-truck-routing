import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DEBUG = os.environ.get("DEBUG", "false").lower() == "true"
SECRET_KEY = os.environ.get("SECRET_KEY", "local-assessment-only-do-not-use-in-production")
ALLOWED_HOSTS = os.environ.get("ALLOWED_HOSTS", "localhost,127.0.0.1,testserver").split(",")
ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
INSTALLED_APPS = ["django.contrib.staticfiles", "routing"]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.middleware.common.CommonMiddleware",
]
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR.parent / "frontend" / "dist"],
        "APP_DIRS": True,
    }
]
STATIC_URL = "/assets/"
WHITENOISE_IMMUTABLE_FILE_TEST = r"^.+[-.][A-Za-z0-9_-]{8,12}\.(?:js|css|woff2)$"
STATIC_ROOT = BASE_DIR.parent / "staticfiles"
STATICFILES_DIRS = (
    [BASE_DIR.parent / "frontend" / "dist" / "assets"]
    if (BASE_DIR.parent / "frontend" / "dist" / "assets").exists()
    else []
)
STORAGES = {"staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"}}
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "route-forecast",
        "OPTIONS": {"MAX_ENTRIES": 512},
    }
}
DATA_UPLOAD_MAX_MEMORY_SIZE = 8192
USE_TZ = True
TIME_ZONE = "UTC"
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
SECURE_SSL_REDIRECT = os.environ.get("SECURE_SSL_REDIRECT", "false").lower() == "true"
# Enable only behind an ingress that replaces (rather than forwards) this header.
if os.environ.get("TRUST_PROXY", "false").lower() == "true":
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
OSRM_URL = os.environ.get("OSRM_URL", "https://router.project-osrm.org")
WEATHER_URL = os.environ.get("WEATHER_URL", "https://api.open-meteo.com/v1/forecast")
GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
