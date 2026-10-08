from typing import Any, Dict, List, Optional
from pydantic import BaseModel, HttpUrl
from fastapi import APIRouter, HTTPException, status
from app.services.safety.url_guard import validate_url
from app.services.safety.robots import check_robots_txt
from app.services.safety.policy_detect import detect_policy_warnings
from app.services.scorer.scrapability import evaluate_scrapability
from app.services.engine.fetcher import fetch_page


router = APIRouter()


class CheckRequest(BaseModel):
    url: str
    custom_headers: Optional[Dict[str, str]] = None


class ChecklistItem(BaseModel):
    key: str
    label: str
    passed: bool
    status: str  # "pass", "fail", "warn"
    details: str


class CheckResponse(BaseModel):
    url: str
    allowed: bool
    score: int
    level: str  # "easy", "medium", "hard"
    recommended_method: str  # "http", "playwright"
    reasons: List[str]
    checklist: List[ChecklistItem]
    resolved_ip: Optional[str] = None
    robots: Dict[str, Any]
    policy: Dict[str, Any]
    page_metrics: Dict[str, Any]


@router.post("/check", response_model=CheckResponse)
async def check_url(req: CheckRequest) -> CheckResponse:
    """
    Checks if a URL is safe and scrapable.
    Runs SSRF validation, fetches robots.txt, analyzes response, policy clauses, and computes 0-100 scrapability score.
    """
    target_url = req.url.strip()

    # 1. SSRF & URL Safety Guard
    is_valid, resolved_ip, err = validate_url(target_url)
    if not is_valid:
        checklist = [
            ChecklistItem(
                key="ssrf_guard",
                label="SSRF & Private IP Guard",
                passed=False,
                status="fail",
                details=err or "Invalid URL or blocked IP"
            )
        ]
        return CheckResponse(
            url=target_url,
            allowed=False,
            score=0,
            level="hard",
            recommended_method="http",
            reasons=[f"Security Guard: {err}"],
            checklist=checklist,
            resolved_ip=resolved_ip,
            robots={"allowed": False, "reason": "Blocked by security guard"},
            policy={"has_scraping_restrictions": False, "summary": "N/A"},
            page_metrics={"status_code": 0, "size_bytes": 0}
        )

    # 2. Check Robots.txt
    robots_res = await check_robots_txt(target_url)

    # 3. Fetch Page Sample
    fetch_res = await fetch_page(target_url, method="http", custom_headers=req.custom_headers)

    if fetch_res.error and fetch_res.status_code == 403 and "SSRF" in fetch_res.error:
        raise HTTPException(status_code=400, detail=fetch_res.error)

    # 4. Detect Policy & ToS Restrictions
    policy_res = detect_policy_warnings(fetch_res.html, target_url)

    # 5. Evaluate Scrapability
    score_res = evaluate_scrapability(
        status_code=fetch_res.status_code,
        headers=fetch_res.headers,
        html=fetch_res.html,
        robots_allowed=robots_res.allowed,
        robots_reason=robots_res.reason,
        content_length=len(fetch_res.html.encode("utf-8"))
    )

    # 6. Build Checklist with Pass / Fail / Warn per item
    checklist = [
        ChecklistItem(
            key="ssrf_guard",
            label="SSRF & Security Guard",
            passed=True,
            status="pass",
            details=f"Valid public host ({resolved_ip})"
        ),
        ChecklistItem(
            key="http_status",
            label="HTTP Status Code",
            passed=fetch_res.status_code == 200,
            status="pass" if fetch_res.status_code == 200 else ("warn" if fetch_res.status_code < 400 else "fail"),
            details=f"Returned HTTP {fetch_res.status_code} in {fetch_res.duration_ms}ms"
        ),
        ChecklistItem(
            key="robots_txt",
            label="Robots.txt Policy",
            passed=robots_res.allowed,
            status="pass" if robots_res.allowed else "fail",
            details=robots_res.reason or ("Allowed" if robots_res.allowed else "Disallowed")
        ),
        ChecklistItem(
            key="bot_protection",
            label="Anti-Bot & CAPTCHA Wall",
            passed=not score_res.factors.get("has_bot_protection", False),
            status="fail" if score_res.factors.get("has_bot_protection") else "pass",
            details="No bot blocks detected" if not score_res.factors.get("has_bot_protection") else ", ".join(score_res.factors.get("bot_defenses", []))
        ),
        ChecklistItem(
            key="login_wall",
            label="Authentication Wall",
            passed=not score_res.factors.get("has_login_wall", False),
            status="fail" if score_res.factors.get("has_login_wall") else "pass",
            details="Page is publicly visible" if not score_res.factors.get("has_login_wall") else "Login required"
        ),
        ChecklistItem(
            key="policy_warning",
            label="Terms of Service & Policy",
            passed=not policy_res.get("has_scraping_restrictions", False),
            status="warn" if policy_res.get("has_scraping_restrictions") else "pass",
            details=policy_res.get("summary", "No prohibitions found")
        )
    ]

    return CheckResponse(
        url=target_url,
        allowed=score_res.allow_scraping,
        score=score_res.score,
        level=score_res.level,
        recommended_method=score_res.recommended_method,
        reasons=score_res.reasons,
        checklist=checklist,
        resolved_ip=resolved_ip,
        robots=robots_res.to_dict(),
        policy=policy_res,
        page_metrics={
            "status_code": fetch_res.status_code,
            "duration_ms": fetch_res.duration_ms,
            "size_bytes": len(fetch_res.html.encode("utf-8")),
            "method_used": fetch_res.method_used,
            "has_json_ld": score_res.factors.get("has_json_ld", False),
            "has_opengraph": score_res.factors.get("has_opengraph", False)
        }
    )
