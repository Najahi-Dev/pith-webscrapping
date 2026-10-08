import asyncio
import random
import time
from typing import Dict, List, Optional, Any
from urllib.parse import urlparse
import httpx
from app.core.config import settings


class ProxyNode:
    def __init__(self, raw_url: str):
        self.raw_url = raw_url.strip()
        parsed = urlparse(self.raw_url if "://" in self.raw_url else f"http://{self.raw_url}")
        
        self.protocol = (parsed.scheme or "http").lower()
        self.host = parsed.hostname or ""
        self.port = parsed.port or (443 if self.protocol == "https" else 80)
        self.username = parsed.username
        self.password = parsed.password
        
        # Build normalized format for httpx and playwright
        if self.username and self.password:
            self.formatted_url = f"{self.protocol}://{self.username}:{self.password}@{self.host}:{self.port}"
        else:
            self.formatted_url = f"{self.protocol}://{self.host}:{self.port}"

        self.failures_count = 0
        self.successes_count = 0
        self.consecutive_failures = 0
        self.last_used_at: Optional[float] = None
        self.cooldown_until: Optional[float] = None
        self.last_latency_ms: Optional[int] = None
        self.last_error: Optional[str] = None

    @property
    def is_available(self) -> bool:
        if self.cooldown_until and time.time() < self.cooldown_until:
            return False
        return True

    def to_dict(self) -> Dict[str, Any]:
        return {
            "protocol": self.protocol,
            "host": self.host,
            "port": self.port,
            "has_auth": bool(self.username and self.password),
            "is_available": self.is_available,
            "failures_count": self.failures_count,
            "successes_count": self.successes_count,
            "consecutive_failures": self.consecutive_failures,
            "last_latency_ms": self.last_latency_ms,
            "cooldown_remaining_sec": max(0, int((self.cooldown_until or 0) - time.time())) if self.cooldown_until else 0,
            "last_error": self.last_error,
        }

    def to_playwright_proxy(self) -> Dict[str, str]:
        config = {
            "server": f"{self.protocol}://{self.host}:{self.port}"
        }
        if self.username and self.password:
            config["username"] = self.username
            config["password"] = self.password
        return config


class ProxyPool:
    """
    High-density proxy pool with health scoring, automatic rotation, and failover cooldowns.
    """
    def __init__(self):
        self._proxies: Dict[str, ProxyNode] = {}
        self._round_robin_idx = 0
        self._sticky_domain_map: Dict[str, str] = {}
        
        # Load initial pool from settings
        if settings.PROXY_POOL:
            self.add_proxies(settings.PROXY_POOL)

    def add_proxy(self, proxy_url: str) -> Optional[ProxyNode]:
        if not proxy_url or not proxy_url.strip():
            return None
        clean_url = proxy_url.strip()
        if clean_url not in self._proxies:
            node = ProxyNode(clean_url)
            self._proxies[clean_url] = node
            return node
        return self._proxies[clean_url]

    def add_proxies(self, proxy_urls: List[str]):
        for url in proxy_urls:
            self.add_proxy(url)

    def remove_proxy(self, proxy_url: str):
        if proxy_url in self._proxies:
            del self._proxies[proxy_url]

    def get_proxy(
        self,
        domain: Optional[str] = None,
        strategy: Optional[str] = None
    ) -> Optional[ProxyNode]:
        """
        Retrieves next available proxy using the selected rotation strategy.
        Supports: 'round-robin', 'random', 'least-failed', 'sticky-domain'.
        """
        if not self._proxies:
            return None

        available_proxies = [p for p in self._proxies.values() if p.is_available]
        if not available_proxies:
            # If all are in cooldown, fallback to least recently failed proxy
            available_proxies = sorted(self._proxies.values(), key=lambda p: p.cooldown_until or 0)
            if not available_proxies:
                return None

        rot_strategy = strategy or settings.PROXY_ROTATION_STRATEGY

        if rot_strategy == "sticky-domain" and domain:
            assigned_raw = self._sticky_domain_map.get(domain)
            if assigned_raw and assigned_raw in self._proxies and self._proxies[assigned_raw].is_available:
                proxy = self._proxies[assigned_raw]
                proxy.last_used_at = time.time()
                return proxy

        if rot_strategy == "random":
            proxy = random.choice(available_proxies)
        elif rot_strategy == "least-failed":
            proxy = min(available_proxies, key=lambda p: p.consecutive_failures)
        else:
            # Default: Round Robin
            self._round_robin_idx = (self._round_robin_idx + 1) % len(available_proxies)
            proxy = available_proxies[self._round_robin_idx]

        proxy.last_used_at = time.time()
        if domain:
            self._sticky_domain_map[domain] = proxy.raw_url
        return proxy

    def report_success(self, proxy_url: str, latency_ms: Optional[int] = None):
        node = self._proxies.get(proxy_url)
        if node:
            node.successes_count += 1
            node.consecutive_failures = 0
            node.cooldown_until = None
            if latency_ms is not None:
                node.last_latency_ms = latency_ms

    def report_failure(
        self,
        proxy_url: str,
        status_code: Optional[int] = None,
        error: Optional[str] = None
    ):
        node = self._proxies.get(proxy_url)
        if not node:
            return

        node.failures_count += 1
        node.consecutive_failures += 1
        node.last_error = error or f"HTTP {status_code}"

        # If 429 Too Many Requests, 403 Forbidden, or exceeded max consecutive failures
        if status_code in (429, 403, 502, 503) or node.consecutive_failures >= settings.MAX_PROXY_FAILURES:
            cooldown_time = settings.PROXY_COOLDOWN_SECONDS * min(node.consecutive_failures, 5)
            node.cooldown_until = time.time() + cooldown_time
            print(f"[ProxyPool] Cooldown applied to {node.host}:{node.port} for {cooldown_time}s (Error: {node.last_error})")

    async def test_proxy(
        self,
        proxy_url: str,
        test_url: str = "https://httpbin.org/ip",
        timeout: float = 8.0
    ) -> Dict[str, Any]:
        """
        Tests proxy connectivity, external IP, and response latency.
        """
        node = ProxyNode(proxy_url)
        start = time.time()
        try:
            async with httpx.AsyncClient(proxy=node.formatted_url, timeout=timeout) as client:
                resp = await client.get(test_url)
                latency = int((time.time() - start) * 1000)
                if resp.status_code == 200:
                    data = resp.json() if "application/json" in resp.headers.get("content-type", "") else {}
                    ip = data.get("origin", "Unknown")
                    return {
                        "ok": True,
                        "ip": ip,
                        "latency_ms": latency,
                        "status_code": resp.status_code,
                        "proxy": proxy_url
                    }
                else:
                    return {
                        "ok": False,
                        "status_code": resp.status_code,
                        "error": f"Server returned HTTP {resp.status_code}",
                        "latency_ms": latency,
                        "proxy": proxy_url
                    }
        except Exception as e:
            return {
                "ok": False,
                "error": str(e),
                "latency_ms": int((time.time() - start) * 1000),
                "proxy": proxy_url
            }

    def get_status(self) -> Dict[str, Any]:
        total = len(self._proxies)
        available = sum(1 for p in self._proxies.values() if p.is_available)
        return {
            "total_proxies": total,
            "available_proxies": available,
            "in_cooldown": total - available,
            "strategy": settings.PROXY_ROTATION_STRATEGY,
            "proxies": [p.to_dict() for p in self._proxies.values()]
        }


# Global singleton instance
proxy_pool = ProxyPool()
