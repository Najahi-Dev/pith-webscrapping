import json
from typing import Any, Dict, List, Optional
import httpx
from app.core.config import settings


async def suggest_fields_and_categories_ai(
    sample_text_or_html: str,
    api_key: Optional[str] = None,
    provider: Optional[str] = None
) -> Dict[str, Any]:
    """
    Sends a small trimmed sample (max 2000 chars) to LLM to suggest canonical field names and categories for messy pages.
    Returns fallback if disabled or no key provided.
    """
    effective_key = api_key or settings.AI_API_KEY
    if not settings.ENABLE_AI_SUGGESTIONS and not api_key:
        return {
            "enabled": False,
            "suggestions": []
        }

    if not effective_key:
        return {
            "enabled": False,
            "error": "No API key provided for AI suggestions",
            "suggestions": []
        }

    trimmed_sample = sample_text_or_html[:1800]
    prompt = f"""You are a data extraction assistant. Given this small snippet of a webpage, suggest 3-5 clean, normalized column/field names (e.g. title, price, brand, rating, in_stock) and a category name. Return pure JSON format:
{{
  "category": "Suggested Category",
  "fields": [
    {{"name": "field_name", "type": "string|number|currency|date", "description": "brief desc"}}
  ]
}}
Webpage snippet:
{trimmed_sample}"""

    # If OpenAI / Open-compatible endpoint
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {effective_key}"},
                json={
                    "model": settings.AI_MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.2,
                    "response_format": {"type": "json_object"}
                }
            )
            if resp.status_code == 200:
                data = resp.json()
                content = data["choices"][0]["message"]["content"]
                parsed = json.loads(content)
                return {
                    "enabled": True,
                    "provider": "openai",
                    "category": parsed.get("category"),
                    "fields": parsed.get("fields", [])
                }
    except Exception as e:
        return {
            "enabled": True,
            "error": f"AI provider request failed: {str(e)}",
            "fields": []
        }

    return {"enabled": False, "fields": []}
