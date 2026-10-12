"""Check the built app's actual HTML/static/HTTP boundary, without public API traffic."""

import re
import sys
from html.parser import HTMLParser
from urllib.parse import urljoin

import httpx


class Assets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = []

    def handle_starttag(self, tag, attrs):
        for name, value in attrs:
            if name in ("href", "src") and value and value.startswith("/assets/"):
                self.paths.append(value)


base = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
with httpx.Client(base_url=base, timeout=10) as client:
    page = client.get("/")
    page.raise_for_status()
    assert page.headers["content-type"].startswith("text/html")
    assert page.headers["cache-control"] == "no-cache"
    parser = Assets()
    parser.feed(page.text)
    assert len(parser.paths) >= 2
    for path in parser.paths:
        response = client.get(path)
        response.raise_for_status()
        assert "immutable" in response.headers["cache-control"]
        if path.endswith(".css"):
            assert response.headers["content-type"].startswith("text/css")
            for font in re.findall(r"url\(([^)]*\.woff2)\)", response.text):
                font_response = client.get(urljoin(path, font.strip("\"'")))
                font_response.raise_for_status()
                assert font_response.headers["content-type"].startswith("font/woff2")
        elif path.endswith(".js"):
            assert "javascript" in response.headers["content-type"]
    assert client.get("/api/health").json()["status"] == "ok"
    assert client.get("/missing").status_code == 404
    assert client.post("/api/plan", json={}).status_code == 400
    print("PASS: HTML revalidation; immutable JS/CSS; local font; health; 404; invalid JSON trip.")
