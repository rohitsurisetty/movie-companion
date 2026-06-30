"""
Iter31: Profile picture upload regression tests.

Covers the bug fix for "Upload Failed" on real iPhone APKs:
- New HEIF/HEIC brand sniffing (heix/heim/heis/hevc/hvc1/mif1/msf1/avif)
- 15MB max size, garbage payload returns 400 not 500
- BOLA enforcement via require_owner (returns 404)
- Missing auth → 401 (global auth gate)
- Batch upload happy path + BOLA + no-auth
"""
import os
import io
import base64
import pytest
import requests
from PIL import Image

BASE_URL = os.environ['EXPO_PUBLIC_BACKEND_URL'].rstrip('/')


# ============== fixtures ==============

@pytest.fixture(scope="module")
def user_a():
    """Register & authenticate user A via email-OTP dev flow."""
    return _register_user("TEST_iter31_userA@example.com", "Iter31 UserA")


@pytest.fixture(scope="module")
def user_b():
    return _register_user("TEST_iter31_userB@example.com", "Iter31 UserB")


def _register_user(email: str, name: str) -> dict:
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/send-email-otp", json={"email": email}, timeout=15)
    assert r.status_code == 200, f"send-email-otp {r.status_code}: {r.text}"
    body = r.json()
    otp = body.get("otp")
    assert otp, "Dev mode OTP missing — INSECURE_DEV_AUTH may not be set"

    r = s.post(f"{BASE_URL}/api/auth/verify-otp", json={
        "identifier": email, "type": "email", "otp": otp, "name": name,
    }, timeout=15)
    assert r.status_code == 200, f"verify-otp {r.status_code}: {r.text}"
    body = r.json()
    return {
        "user_id": body["user_id"],
        "session_token": body["session_token"],
        "email": email,
    }


def _auth_headers(user):
    return {"Authorization": f"Bearer {user['session_token']}"}


def _make_jpeg_b64(size=(64, 64), color=(255, 0, 0)) -> str:
    img = Image.new("RGB", size, color=color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _fake_heif_b64(brand: bytes, pad_bytes: int = 2048) -> str:
    # Build a minimal ISO-BMFF ftyp box: size(4) + 'ftyp'(4) + major(4) + minor(4) + compat(4)
    # Bytes 4-8 must be 'ftyp'; bytes 8-12 are the brand.
    box = bytes.fromhex("00000018") + b"ftyp" + brand + b"\x00\x00\x00\x00" + brand
    payload = box + (b"\x00" * pad_bytes)
    return base64.b64encode(payload).decode("ascii")


def _fake_webp_b64(pad_bytes: int = 2048) -> str:
    head = b"RIFF" + (b"\x00" * 4) + b"WEBPVP8 " + (b"\x00" * pad_bytes)
    return base64.b64encode(head).decode("ascii")


# ============== happy path ==============

class TestUploadHappyPath:
    def test_upload_real_jpeg_returns_200(self, user_a):
        b64 = _make_jpeg_b64()
        r = requests.post(
            f"{BASE_URL}/api/user/pictures/upload",
            headers=_auth_headers(user_a),
            json={
                "user_id": user_a["user_id"],
                "session_id": "iter31-session",
                "picture_number": 1,
                "image_data": b64,
                "content_type": "image/jpeg",
            },
            timeout=30,
        )
        assert r.status_code == 200, f"got {r.status_code}: {r.text}"
        body = r.json()
        assert body.get("success") is True
        assert body.get("picture_number") == 1
        assert isinstance(body.get("picture_url"), str) and body["picture_url"]

    def test_upload_webp_returns_200(self, user_a):
        b64 = _fake_webp_b64()
        r = requests.post(
            f"{BASE_URL}/api/user/pictures/upload",
            headers=_auth_headers(user_a),
            json={
                "user_id": user_a["user_id"],
                "session_id": "iter31-session",
                "picture_number": 2,
                "image_data": b64,
                "content_type": "image/webp",
            },
            timeout=30,
        )
        assert r.status_code == 200, f"got {r.status_code}: {r.text}"
        assert r.json().get("success") is True


class TestHEIFVariants:
    """The CORE BUG FIX — modern iPhone uploads use brands beyond plain 'heic'."""

    @pytest.mark.parametrize("brand", [
        b"hvc1", b"heix", b"heim", b"heis", b"hevc", b"mif1", b"msf1", b"avif",
    ])
    def test_heif_brand_accepted(self, user_a, brand):
        b64 = _fake_heif_b64(brand)
        r = requests.post(
            f"{BASE_URL}/api/user/pictures/upload",
            headers=_auth_headers(user_a),
            json={
                "user_id": user_a["user_id"],
                "session_id": "iter31-session",
                "picture_number": 3,
                "image_data": b64,
                "content_type": "image/heic",
            },
            timeout=30,
        )
        assert r.status_code == 200, f"brand={brand!r} got {r.status_code}: {r.text}"
        body = r.json()
        assert body.get("success") is True
        assert body.get("picture_url")


# ============== error handling ==============

class TestUploadErrors:
    def test_garbage_base64_returns_400(self, user_a):
        r = requests.post(
            f"{BASE_URL}/api/user/pictures/upload",
            headers=_auth_headers(user_a),
            json={
                "user_id": user_a["user_id"],
                "session_id": "iter31-session",
                "picture_number": 1,
                # 32+ chars (so the early "too small" guard does not fire),
                # but contains non-base64 chars that decode to garbage.
                "image_data": "abc!!!!@@@@####$$$$%%%%^^^^&&&&((((",
                "content_type": "image/jpeg",
            },
            timeout=30,
        )
        # Must be 400 (NOT 500) and have a detail explaining the issue.
        assert r.status_code == 400, f"got {r.status_code}: {r.text}"
        assert "detail" in r.json()

    def test_plain_text_payload_returns_400(self, user_a):
        # Valid base64 but the decoded bytes are not a recognised image header.
        b64 = base64.b64encode(b"this is plain text, definitely not an image" * 4).decode()
        r = requests.post(
            f"{BASE_URL}/api/user/pictures/upload",
            headers=_auth_headers(user_a),
            json={
                "user_id": user_a["user_id"],
                "session_id": "iter31-session",
                "picture_number": 1,
                "image_data": b64,
                "content_type": "image/jpeg",
            },
            timeout=30,
        )
        assert r.status_code == 400, f"got {r.status_code}: {r.text}"

    def test_oversized_payload_returns_400(self, user_a):
        # Valid JPEG header + huge padding > 15MB. Send as a real JPEG built
        # from a giant random buffer is expensive — easier: forge a JPEG SOI
        # and pad with 16 MB of zeros so the size check fires.
        oversized = b"\xff\xd8\xff" + (b"\x00" * (16 * 1024 * 1024))
        b64 = base64.b64encode(oversized).decode("ascii")
        r = requests.post(
            f"{BASE_URL}/api/user/pictures/upload",
            headers=_auth_headers(user_a),
            json={
                "user_id": user_a["user_id"],
                "session_id": "iter31-session",
                "picture_number": 1,
                "image_data": b64,
                "content_type": "image/jpeg",
            },
            timeout=60,
        )
        assert r.status_code == 400, f"got {r.status_code}: {r.text}"


# ============== auth / BOLA ==============

class TestUploadAuth:
    def test_upload_without_auth_returns_401(self, user_a):
        b64 = _make_jpeg_b64()
        r = requests.post(
            f"{BASE_URL}/api/user/pictures/upload",
            json={
                "user_id": user_a["user_id"],
                "session_id": "iter31-session",
                "picture_number": 1,
                "image_data": b64,
                "content_type": "image/jpeg",
            },
            timeout=15,
        )
        assert r.status_code == 401, f"got {r.status_code}: {r.text}"

    def test_bola_upload_to_other_user_returns_404(self, user_a, user_b):
        """User A authenticates but sets body.user_id to user B's id → 404."""
        b64 = _make_jpeg_b64()
        r = requests.post(
            f"{BASE_URL}/api/user/pictures/upload",
            headers=_auth_headers(user_a),
            json={
                "user_id": user_b["user_id"],
                "session_id": "iter31-session",
                "picture_number": 1,
                "image_data": b64,
                "content_type": "image/jpeg",
            },
            timeout=30,
        )
        assert r.status_code == 404, f"got {r.status_code}: {r.text}"


# ============== batch upload ==============

class TestBatchUpload:
    def test_batch_upload_three_pictures(self, user_a):
        pics = {f"picture_{i}": _make_jpeg_b64(color=(50 * i, 100, 150)) for i in range(1, 4)}
        r = requests.post(
            f"{BASE_URL}/api/user/pictures/upload-batch",
            headers=_auth_headers(user_a),
            json={
                "user_id": user_a["user_id"],
                "session_id": "iter31-batch",
                "pictures": pics,
            },
            timeout=60,
        )
        assert r.status_code == 200, f"got {r.status_code}: {r.text}"
        body = r.json()
        assert body.get("success") is True
        assert body.get("uploaded_count") == 3
        urls = body.get("picture_urls") or {}
        for n in (1, 2, 3):
            key = f"picture_{n}"
            assert key in urls and urls[key], f"missing url for {key}"

    def test_batch_bola_returns_404(self, user_a, user_b):
        pics = {"picture_1": _make_jpeg_b64()}
        r = requests.post(
            f"{BASE_URL}/api/user/pictures/upload-batch",
            headers=_auth_headers(user_a),
            json={
                "user_id": user_b["user_id"],
                "session_id": "iter31-batch",
                "pictures": pics,
            },
            timeout=30,
        )
        assert r.status_code == 404, f"got {r.status_code}: {r.text}"

    def test_batch_without_auth_returns_401(self, user_a):
        pics = {"picture_1": _make_jpeg_b64()}
        r = requests.post(
            f"{BASE_URL}/api/user/pictures/upload-batch",
            json={
                "user_id": user_a["user_id"],
                "session_id": "iter31-batch",
                "pictures": pics,
            },
            timeout=15,
        )
        assert r.status_code == 401, f"got {r.status_code}: {r.text}"


# ============== persistence verification ==============

class TestPersistence:
    def test_get_pictures_after_upload(self, user_a):
        # Upload one then GET to confirm persisted
        b64 = _make_jpeg_b64()
        r = requests.post(
            f"{BASE_URL}/api/user/pictures/upload",
            headers=_auth_headers(user_a),
            json={
                "user_id": user_a["user_id"],
                "session_id": "iter31-persist",
                "picture_number": 4,
                "image_data": b64,
                "content_type": "image/jpeg",
            },
            timeout=30,
        )
        assert r.status_code == 200, f"upload failed: {r.text}"

        r = requests.get(
            f"{BASE_URL}/api/user/pictures/{user_a['user_id']}",
            headers=_auth_headers(user_a),
            timeout=15,
        )
        assert r.status_code == 200, f"get failed: {r.text}"
        body = r.json()
        # Endpoint shape varies; assert picture_4 surface in either pictures or top-level
        pics = body.get("pictures") or body
        assert pics.get("picture_4"), f"picture_4 not persisted: {body}"
