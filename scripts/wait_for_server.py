"""Bounded startup wait for local/container smoke checks; no public provider calls."""

import sys
import time

import httpx

url = sys.argv[1]
with httpx.Client(timeout=2) as client:
    for attempt in range(30):
        try:
            if client.get(url).status_code == 200:
                print("Application health endpoint is ready.")
                break
        except httpx.TransportError:
            pass  # The socket can be absent while the image is starting.
        time.sleep(1)
    else:
        raise SystemExit("Application did not become healthy within the startup window.")
