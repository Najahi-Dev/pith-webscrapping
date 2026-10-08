import pytest
from app.services.safety.url_guard import validate_url


def test_ssrf_blocks_localhost():
    is_valid, ip, err = validate_url("http://localhost:8000/secret")
    assert not is_valid
    assert "blocked for security" in err


def test_ssrf_blocks_loopback_ip():
    is_valid, ip, err = validate_url("http://127.0.0.1/admin")
    assert not is_valid
    assert "blocked" in err.lower() or "restricted" in err.lower()


def test_ssrf_blocks_cloud_metadata():
    # AWS/GCP instance metadata endpoint
    is_valid, ip, err = validate_url("http://169.254.169.254/latest/meta-data/")
    assert not is_valid
    assert "restricted" in err.lower() or "blocked" in err.lower()


def test_ssrf_blocks_private_subnets():
    # RFC 1918 10.0.0.0/8, 192.168.0.0/16, 172.16.0.0/12
    assert not validate_url("http://10.0.0.1/")[0]
    assert not validate_url("http://192.168.1.1/")[0]
    assert not validate_url("http://172.16.0.5/")[0]


def test_ssrf_rejects_invalid_schemes():
    assert not validate_url("ftp://example.com/file")[0]
    assert not validate_url("file:///etc/passwd")[0]
    assert not validate_url("gopher://example.com")[0]


def test_valid_public_url():
    is_valid, ip, err = validate_url("https://example.com")
    assert is_valid
    assert err is None
    assert ip is not None
