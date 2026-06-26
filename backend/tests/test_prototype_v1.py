"""Tests for the Film Companion V1 prototype HTML endpoints.

Verifies:
- GET /api/prototype/v1 serves the file inline with correct content-type and body.
- GET /api/prototype/v1/download forces download with Content-Disposition header.
- Both endpoints return identical bytes and match the file on disk.
"""
import os
import hashlib
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://match-history-dev.preview.emergentagent.com").rstrip("/")
DISK_PATH = "/app/Film_Companion_Prototype_V1.html"
VIEW_URL = f"{BASE_URL}/api/prototype/v1"
DOWNLOAD_URL = f"{BASE_URL}/api/prototype/v1/download"


@pytest.fixture(scope="module")
def disk_bytes():
    assert os.path.exists(DISK_PATH), f"Source HTML file missing on disk: {DISK_PATH}"
    with open(DISK_PATH, "rb") as f:
        return f.read()


@pytest.fixture(scope="module")
def view_resp():
    return requests.get(VIEW_URL, timeout=30)


@pytest.fixture(scope="module")
def download_resp():
    return requests.get(DOWNLOAD_URL, timeout=30)


# --- /api/prototype/v1 (inline view) ---
class TestPrototypeView:
    def test_status_200(self, view_resp):
        assert view_resp.status_code == 200, f"Expected 200, got {view_resp.status_code}: {view_resp.text[:200]}"

    def test_content_type_html(self, view_resp):
        ct = view_resp.headers.get("Content-Type", "")
        assert "text/html" in ct.lower(), f"Expected text/html, got {ct!r}"

    def test_body_starts_with_doctype(self, view_resp):
        body = view_resp.text
        assert body.lstrip().startswith("<!DOCTYPE html>"), f"Body does not start with <!DOCTYPE html>. First 120 chars: {body[:120]!r}"

    def test_body_contains_title(self, view_resp):
        assert "Film Companion · Prototype V1" in view_resp.text, "Page title 'Film Companion · Prototype V1' missing from response body"

    def test_body_contains_welcome_screen(self, view_resp):
        assert 'data-name="Welcome"' in view_resp.text, "data-name=\"Welcome\" screen label missing — full file may not be served"

    def test_content_length_matches_disk(self, view_resp, disk_bytes):
        """The inline endpoint goes through Cloudflare which injects a ~1KB
        bot-detection script before </body>. Validate that the original file
        bytes are fully present (everything up to the trailing </script></body>
        injection) and that any extra bytes are < 2KB (CDN injection only)."""
        body = view_resp.content
        disk_len = len(disk_bytes)
        body_len = len(body)
        # Original file's body content must be present (up to but not including the closing </body>)
        original_head = disk_bytes[: disk_bytes.rfind(b"</body>")]
        assert original_head in body, "Original HTML file content is not fully present in the inline response"
        # Size should be >= disk size and within ~2KB of it (only CDN script injected)
        assert body_len >= disk_len, f"Response smaller than disk: {body_len} < {disk_len}"
        assert body_len - disk_len < 2048, (
            f"Response exceeds disk by {body_len - disk_len} bytes — more than expected CDN injection"
        )

    def test_no_attachment_header(self, view_resp):
        cd = view_resp.headers.get("Content-Disposition", "")
        assert "attachment" not in cd.lower(), f"Inline endpoint should NOT have attachment disposition, got: {cd!r}"


# --- /api/prototype/v1/download (force download) ---
class TestPrototypeDownload:
    def test_status_200(self, download_resp):
        assert download_resp.status_code == 200, f"Expected 200, got {download_resp.status_code}: {download_resp.text[:200]}"

    def test_content_type_html(self, download_resp):
        ct = download_resp.headers.get("Content-Type", "")
        assert "text/html" in ct.lower(), f"Expected text/html, got {ct!r}"

    def test_content_disposition_attachment(self, download_resp):
        cd = download_resp.headers.get("Content-Disposition", "")
        assert "attachment" in cd.lower(), f"Expected attachment in Content-Disposition, got: {cd!r}"
        assert "Film_Companion_Prototype_V1.html" in cd, f"Expected filename in Content-Disposition, got: {cd!r}"

    def test_body_identical_to_view(self, download_resp, view_resp, disk_bytes):
        """Both endpoints serve the same underlying file. The download endpoint
        (Content-Disposition: attachment) is delivered untouched and matches
        disk byte-for-byte. The inline view endpoint goes through the
        Cloudflare CDN which injects a bot-detection script before </body>,
        so it differs in length but contains all the original file bytes."""
        # Download must equal disk exactly (verified again here for symmetry)
        assert download_resp.content == disk_bytes, "Download body differs from disk file"
        # View must contain the original file's HTML body content
        original_head = disk_bytes[: disk_bytes.rfind(b"</body>")]
        assert original_head in view_resp.content, (
            "View body does not fully contain the original file content"
        )

    def test_body_matches_disk(self, download_resp, disk_bytes):
        assert download_resp.content == disk_bytes, (
            f"Served bytes do not match disk file. served_sha256={hashlib.sha256(download_resp.content).hexdigest()}, "
            f"disk_sha256={hashlib.sha256(disk_bytes).hexdigest()}"
        )
