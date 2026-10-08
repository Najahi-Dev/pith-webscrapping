from typing import Any, Dict, List, Optional
from pydantic import BaseModel
from fastapi import APIRouter
from app.services.ai.suggestion import suggest_fields_and_categories_ai


router = APIRouter()


class AISuggestRequest(BaseModel):
    sample_text: str
    api_key: Optional[str] = None
    provider: Optional[str] = None


@router.post("/ai/suggest")
async def ai_suggest_fields(req: AISuggestRequest) -> Dict[str, Any]:
    """
    Optional AI helper to suggest field names and categories on messy pages.
    Operates strictly on trimmed snippet (<= 2000 chars).
    """
    return await suggest_fields_and_categories_ai(
        sample_text_or_html=req.sample_text,
        api_key=req.api_key,
        provider=req.provider
    )
