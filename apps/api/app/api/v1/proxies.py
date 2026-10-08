from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from app.services.safety.proxy_manager import proxy_pool, ProxyNode
from app.core.config import settings

router = APIRouter(prefix="/proxies", tags=["Stealth & Proxy Pool"])


class AddProxiesRequest(BaseModel):
    proxies: List[str] = Field(..., description="List of proxy URLs (http://host:port or http://user:pass@host:port)")


class TestProxyRequest(BaseModel):
    proxy_url: str = Field(..., description="Proxy URL to test")
    test_url: Optional[str] = Field("https://httpbin.org/ip", description="Target test endpoint")
    timeout: Optional[float] = Field(8.0, ge=1.0, le=30.0)


@router.get("", summary="Get proxy pool status")
async def get_proxy_pool_status() -> Dict[str, Any]:
    """
    Returns current proxy pool statistics, health status, and active nodes.
    """
    return proxy_pool.get_status()


@router.post("", summary="Add proxies to pool")
async def add_proxies_to_pool(payload: AddProxiesRequest) -> Dict[str, Any]:
    """
    Adds new proxy nodes into the active rotation pool.
    """
    added_count = 0
    for p in payload.proxies:
        if p.strip():
            proxy_pool.add_proxy(p.strip())
            added_count += 1
    return {
        "success": True,
        "added": added_count,
        "pool": proxy_pool.get_status()
    }


@router.delete("", summary="Remove a proxy from pool")
async def remove_proxy_from_pool(proxy_url: str = Query(..., description="Proxy URL to remove")) -> Dict[str, Any]:
    """
    Removes a proxy node from rotation.
    """
    proxy_pool.remove_proxy(proxy_url)
    return {
        "success": True,
        "removed": proxy_url,
        "pool": proxy_pool.get_status()
    }


@router.post("/test", summary="Test proxy connectivity and latency")
async def test_proxy_connection(payload: TestProxyRequest) -> Dict[str, Any]:
    """
    Tests proxy connection against an external endpoint, measuring latency and resolving the public IP.
    """
    res = await proxy_pool.test_proxy(
        proxy_url=payload.proxy_url,
        test_url=payload.test_url or "https://httpbin.org/ip",
        timeout=payload.timeout or 8.0
    )
    return res
