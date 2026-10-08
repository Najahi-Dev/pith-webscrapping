from typing import Dict, Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Response
from app.services.engine.fetcher import fetch_page
from app.services.detector.html_preview import sanitize_html_for_preview


router = APIRouter()


class PreviewRequest(BaseModel):
    url: str
    method: Optional[str] = "http"
    html_override: Optional[str] = None
    custom_headers: Optional[Dict[str, str]] = None


class PreviewResponse(BaseModel):
    url: str
    sanitized_html: str
    content_type: str = "text/html"


@router.post("/preview", response_model=PreviewResponse)
async def preview_page(req: PreviewRequest) -> PreviewResponse:
    """
    Returns sandboxed HTML snapshot for the visual picker.
    Scripts and framebusters are removed; <base href> and the Pith inspector bridge are injected.
    """
    target_url = req.url.strip()

    if req.html_override:
        raw_html = req.html_override
    else:
        fetch_res = await fetch_page(target_url, method=req.method or "http", custom_headers=req.custom_headers)
        if fetch_res.error:
            raise HTTPException(status_code=400, detail=f"Failed to fetch preview: {fetch_res.error}")
        raw_html = fetch_res.html

    sanitized = sanitize_html_for_preview(raw_html, target_url)
    return PreviewResponse(
        url=target_url,
        sanitized_html=sanitized,
        content_type="text/html"
    )


@router.get("/preview/render")
async def render_preview_frame(url: str, method: Optional[str] = "http") -> Response:
    """
    Direct HTML render endpoint for embedding inside an iframe with sandbox attributes.
    """
    fetch_res = await fetch_page(url, method=method or "http")
    if fetch_res.error:
        sanitized = f"<html><body style='font-family:monospace;padding:20px;color:#ef4444;'>Error loading preview: {fetch_res.error}</body></html>"
    else:
        sanitized = sanitize_html_for_preview(fetch_res.html, url)
        
    return Response(
        content=sanitized,
        media_type="text/html",
        headers={
            "X-Frame-Options": "SAMEORIGIN",
            "Content-Security-Policy": "default-src 'self' 'unsafe-inline' 'unsafe-eval' * data: blob:;"
        }
    )
