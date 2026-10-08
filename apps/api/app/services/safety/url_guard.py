import ipaddress
import socket
from urllib.parse import urlparse
from typing import Tuple, Optional, List


BLOCKED_NETWORKS = [
    # IPv4 Private and Reserved
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),  # AWS/GCP/Azure metadata 169.254.169.254
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.0.0.0/24"),
    ipaddress.ip_network("192.0.2.0/24"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("198.18.0.0/15"),
    ipaddress.ip_network("198.51.100.0/24"),
    ipaddress.ip_network("203.0.113.0/24"),
    ipaddress.ip_network("224.0.0.0/4"),     # Multicast
    ipaddress.ip_network("240.0.0.0/4"),     # Reserved
    ipaddress.ip_network("255.255.255.255/32"),
    # IPv6 Private and Reserved
    ipaddress.ip_network("::/128"),          # Unspecified
    ipaddress.ip_network("::1/128"),        # Loopback
    ipaddress.ip_network("::ffff:0:0/96"),  # IPv4-mapped
    ipaddress.ip_network("64:ff9b::/96"),
    ipaddress.ip_network("100::/64"),
    ipaddress.ip_network("2001:db8::/32"),
    ipaddress.ip_network("fc00::/7"),       # Unique local address
    ipaddress.ip_network("fe80::/10"),      # Link-local
    ipaddress.ip_network("ff00::/8"),       # Multicast
]

BLOCKED_HOSTNAMES = {
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "metadata.google.internal",
    "instance-data",
}


class URLValidationError(ValueError):
    pass


def is_ip_blocked(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """Checks if an IP address falls into any blocked or private subnet."""
    for network in BLOCKED_NETWORKS:
        if ip in network:
            return True
    return False


def validate_url(url: str, allow_custom_ports: bool = False) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Validates a URL against SSRF vulnerabilities, blocked protocols, private networks, and cloud metadata.
    Returns: (is_valid: bool, resolved_ip: Optional[str], error_message: Optional[str])
    """
    if not url or not isinstance(url, str):
        return False, None, "URL is empty or invalid"

    url_clean = url.strip()
    if not (url_clean.startswith("http://") or url_clean.startswith("https://")):
        return False, None, "URL scheme must be http:// or https://"

    try:
        parsed = urlparse(url_clean)
    except Exception as e:
        return False, None, f"Malformed URL syntax: {str(e)}"

    hostname = parsed.hostname
    if not hostname:
        return False, None, "URL hostname is missing"

    hostname_lower = hostname.lower()

    # Block well-known keywords & internal domains
    if hostname_lower in BLOCKED_HOSTNAMES:
        return False, None, f"Access to host '{hostname}' is blocked for security (SSRF protection)"

    if hostname_lower.endswith(".localhost") or hostname_lower.endswith(".local") or hostname_lower.endswith(".internal") or hostname_lower.endswith(".lan"):
        return False, None, f"Access to internal domain '{hostname}' is blocked"

    # Check port if custom ports restricted
    if parsed.port and parsed.port not in [80, 443, 8080, 8443] and not allow_custom_ports:
        return False, None, f"Port {parsed.port} is not in allowed web ports (80, 443, 8080, 8443)"

    # Resolve IP address
    resolved_ips: List[str] = []
    try:
        # Check direct IP string first
        direct_ip = ipaddress.ip_address(hostname_lower)
        resolved_ips.append(str(direct_ip))
    except ValueError:
        # DNS resolution
        try:
            addr_info = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
            for info in addr_info:
                sockaddr = info[4]
                ip_str = sockaddr[0]
                if ip_str not in resolved_ips:
                    resolved_ips.append(ip_str)
        except socket.gaierror as e:
            return False, None, f"DNS resolution failed for '{hostname}': {str(e)}"
        except Exception as e:
            return False, None, f"Host resolution error: {str(e)}"

    if not resolved_ips:
        return False, None, f"No IP addresses resolved for '{hostname}'"

    # Validate all resolved IPs
    for ip_str in resolved_ips:
        try:
            ip_obj = ipaddress.ip_address(ip_str)
            if is_ip_blocked(ip_obj):
                return False, ip_str, f"Host resolves to restricted or private IP address ({ip_str})"
        except ValueError:
            return False, None, f"Invalid IP address format: {ip_str}"

    return True, resolved_ips[0], None


def safe_redirect_hook(response) -> None:
    """
    Hook to be used in httpx/requests client to re-validate URL after each redirect.
    Raises URLValidationError if redirect target is blocked.
    """
    if response.is_redirect and "location" in response.headers:
        redirect_url = str(response.next_request.url) if response.next_request else response.headers["location"]
        is_valid, _, error_msg = validate_url(redirect_url)
        if not is_valid:
            raise URLValidationError(f"Redirect blocked: {error_msg}")
