import os

from config.wsgi import application
from waitress import serve

serve(application, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), threads=6)
