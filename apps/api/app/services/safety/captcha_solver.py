import asyncio
import re
import time
from typing import Dict, Optional, Any
import httpx
from bs4 import BeautifulSoup
from app.core.config import settings


class CaptchaChallenge:
    def __init__(
        self,
        challenge_type: str,
        sitekey: str,
        page_url: str,
        action: Optional[str] = None,
        cdata: Optional[str] = None
    ):
        self.challenge_type = challenge_type  # 'turnstile', 'recaptcha_v2', 'recaptcha_v3', 'hcaptcha'
        self.sitekey = sitekey
        self.page_url = page_url
        self.action = action
        self.cdata = cdata

    def to_dict(self) -> Dict[str, Any]:
        return {
            "challenge_type": self.challenge_type,
            "sitekey": self.sitekey,
            "page_url": self.page_url,
            "action": self.action,
            "cdata": self.cdata
        }


def detect_captcha_in_html(html: str, page_url: str) -> Optional[CaptchaChallenge]:
    """
    Scans HTML string to detect Cloudflare Turnstile, reCAPTCHA, or hCaptcha widgets.
    """
    if not html:
        return None

    # 1. Cloudflare Turnstile Detection
    # <div class="cf-turnstile" data-sitekey="..."> or window.turnstile.render
    turnstile_match = re.search(r'data-sitekey=["\']([0-9a-zA-Z_\-]+)["\']', html)
    if "cf-turnstile" in html or "challenges.cloudflare.com/turnstile" in html:
        if turnstile_match:
            return CaptchaChallenge(
                challenge_type="turnstile",
                sitekey=turnstile_match.group(1),
                page_url=page_url
            )
        # Regex for turnstile.render(..., {sitekey: '...'})
        render_match = re.search(r'sitekey\s*:\s*["\']([0-9a-zA-Z_\-]+)["\']', html)
        if render_match:
            return CaptchaChallenge(
                challenge_type="turnstile",
                sitekey=render_match.group(1),
                page_url=page_url
            )

    # 2. Google reCAPTCHA Detection
    if "g-recaptcha" in html or "google.com/recaptcha" in html or "recaptcha/api.js" in html:
        recaptcha_match = re.search(r'data-sitekey=["\']([0-9a-zA-Z_\-]+)["\']', html)
        if recaptcha_match:
            return CaptchaChallenge(
                challenge_type="recaptcha_v2",
                sitekey=recaptcha_match.group(1),
                page_url=page_url
            )

    # 3. hCaptcha Detection
    if "h-captcha" in html or "hcaptcha.com" in html:
        hcaptcha_match = re.search(r'data-sitekey=["\']([0-9a-fA-F\-]+)["\']', html)
        if hcaptcha_match:
            return CaptchaChallenge(
                challenge_type="hcaptcha",
                sitekey=hcaptcha_match.group(1),
                page_url=page_url
            )

    return None


async def solve_captcha_2captcha(
    challenge: CaptchaChallenge,
    api_key: str,
    timeout: int = 60
) -> Optional[str]:
    """
    Submits and polls a CAPTCHA challenge via 2Captcha REST API.
    """
    try:
        method_map = {
            "turnstile": "turnstile",
            "recaptcha_v2": "userrecaptcha",
            "recaptcha_v3": "userrecaptcha",
            "hcaptcha": "hcaptcha",
        }
        method = method_map.get(challenge.challenge_type, "userrecaptcha")

        # 1. Submit In Request
        in_params = {
            "key": api_key,
            "method": method,
            "sitekey": challenge.sitekey,
            "pageurl": challenge.page_url,
            "json": 1
        }
        if challenge.action:
            in_params["action"] = challenge.action
        if challenge.cdata:
            in_params["data"] = challenge.cdata

        async with httpx.AsyncClient(timeout=15.0) as client:
            submit_resp = await client.post("https://2captcha.com/in.php", data=in_params)
            submit_data = submit_resp.json()

            if submit_data.get("status") != 1:
                print(f"[CaptchaSolver] 2Captcha submit failed: {submit_data.get('request')}")
                return None

            request_id = submit_data["request"]
            print(f"[CaptchaSolver] 2Captcha task submitted: ID={request_id}. Polling for token...")

            # 2. Poll Result
            start_poll = time.time()
            await asyncio.sleep(5)  # initial wait

            while time.time() - start_poll < timeout:
                await asyncio.sleep(3)
                res_url = f"https://2captcha.com/res.php?key={api_key}&action=get&id={request_id}&json=1"
                poll_resp = await client.get(res_url)
                poll_data = poll_resp.json()

                if poll_data.get("status") == 1:
                    token = poll_data.get("request")
                    print(f"[CaptchaSolver] 2Captcha solved successfully in {int(time.time() - start_poll)}s!")
                    return token
                elif poll_data.get("request") != "CAPCHA_NOT_READY":
                    print(f"[CaptchaSolver] 2Captcha error: {poll_data.get('request')}")
                    return None

        return None
    except Exception as e:
        print(f"[CaptchaSolver] 2Captcha exception: {e}")
        return None


async def solve_captcha_capmonster(
    challenge: CaptchaChallenge,
    api_key: str,
    timeout: int = 60
) -> Optional[str]:
    """
    Submits and polls a CAPTCHA challenge via CapMonster Cloud REST API.
    """
    try:
        type_map = {
            "turnstile": "TurnstileTask",
            "recaptcha_v2": "NoCaptchaTaskProxyless",
            "recaptcha_v3": "RecaptchaV3TaskProxyless",
            "hcaptcha": "HCaptchaTaskProxyless",
        }
        task_type = type_map.get(challenge.challenge_type, "TurnstileTask")

        task_payload: Dict[str, Any] = {
            "type": task_type,
            "websiteURL": challenge.page_url,
            "websiteKey": challenge.sitekey,
        }
        if challenge.cdata:
            task_payload["cdata"] = challenge.cdata

        async with httpx.AsyncClient(timeout=15.0) as client:
            create_resp = await client.post(
                "https://api.capmonster.cloud/createTask",
                json={"clientKey": api_key, "task": task_payload}
            )
            create_data = create_resp.json()
            if create_data.get("errorId", 0) != 0:
                print(f"[CaptchaSolver] CapMonster createTask failed: {create_data.get('errorDescription')}")
                return None

            task_id = create_data["taskId"]
            print(f"[CaptchaSolver] CapMonster task created: ID={task_id}. Polling...")

            start_poll = time.time()
            await asyncio.sleep(4)

            while time.time() - start_poll < timeout:
                await asyncio.sleep(3)
                poll_resp = await client.post(
                    "https://api.capmonster.cloud/getTaskResult",
                    json={"clientKey": api_key, "taskId": task_id}
                )
                poll_data = poll_resp.json()

                if poll_data.get("status") == "ready":
                    solution = poll_data.get("solution", {})
                    token = solution.get("token") or solution.get("gRecaptchaResponse")
                    print(f"[CaptchaSolver] CapMonster solved successfully in {int(time.time() - start_poll)}s!")
                    return token
                elif poll_data.get("status") != "processing":
                    print(f"[CaptchaSolver] CapMonster error: {poll_data}")
                    return None

        return None
    except Exception as e:
        print(f"[CaptchaSolver] CapMonster exception: {e}")
        return None


async def solve_challenge(
    challenge: CaptchaChallenge,
    provider: Optional[str] = None,
    api_key: Optional[str] = None,
    timeout: int = 60
) -> Optional[str]:
    """
    Dispatches to configured solver provider (2captcha or capmonster).
    """
    solv_provider = (provider or settings.CAPTCHA_SOLVER_PROVIDER or "").lower()
    solv_key = api_key or settings.CAPTCHA_SOLVER_API_KEY

    if not solv_provider or not solv_key:
        return None

    if "capmonster" in solv_provider:
        return await solve_captcha_capmonster(challenge, solv_key, timeout)
    elif "2captcha" in solv_provider:
        return await solve_captcha_2captcha(challenge, solv_key, timeout)
    return None


async def inject_captcha_token_into_playwright(page, challenge: CaptchaChallenge, token: str) -> bool:
    """
    Injects solved token into DOM elements and executes framework callbacks.
    """
    try:
        if challenge.challenge_type == "turnstile":
            await page.evaluate(f"""
                (() => {{
                    // Set token into all turnstile response input fields
                    const inputs = document.querySelectorAll('input[name="cf-turnstile-response"], textarea[name="cf-turnstile-response"]');
                    inputs.forEach(el => {{
                        el.value = '{token}';
                        el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                        el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                    }});
                    // Trigger global callback if available
                    if (window.turnstile && typeof window.turnstile.callback === 'function') {{
                        window.turnstile.callback('{token}');
                    }}
                }})();
            """)
            return True
        elif "recaptcha" in challenge.challenge_type:
            await page.evaluate(f"""
                (() => {{
                    const inputs = document.querySelectorAll('textarea[name="g-recaptcha-response"], input[name="g-recaptcha-response"]');
                    inputs.forEach(el => {{
                        el.value = '{token}';
                        el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                        el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                    }});
                    // Trigger reCAPTCHA callback if registered
                    if (window.___grecaptcha_cfg && window.___grecaptcha_cfg.clients) {{
                        Object.keys(window.___grecaptcha_cfg.clients).forEach(k => {{
                            const c = window.___grecaptcha_cfg.clients[k];
                            if (c && c.V && typeof c.V.callback === 'function') {{
                                c.V.callback('{token}');
                            }}
                        }});
                    }}
                }})();
            """)
            return True
        elif challenge.challenge_type == "hcaptcha":
            await page.evaluate(f"""
                (() => {{
                    const inputs = document.querySelectorAll('textarea[name="h-captcha-response"], input[name="h-captcha-response"]');
                    inputs.forEach(el => {{
                        el.value = '{token}';
                        el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                        el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                    }});
                }})();
            """)
            return True
    except Exception as e:
        print(f"[CaptchaSolver] Injection failed: {e}")
        return False
    return False
