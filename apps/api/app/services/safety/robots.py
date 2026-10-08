import re
from typing import Dict, List, Optional, Tuple
from urllib.parse import urlparse, urljoin
import httpx
from app.core.config import settings
from app.services.safety.url_guard import validate_url


class RobotsTxtResult:
    def __init__(
        self,
        allowed: bool = True,
        status_code: Optional[int] = None,
        crawl_delay: Optional[float] = None,
        sitemaps: Optional[List[str]] = None,
        matching_rule: Optional[str] = None,
        reason: Optional[str] = None,
        raw_robots_txt: Optional[str] = None
    ):
        self.allowed = allowed
        self.status_code = status_code
        self.crawl_delay = crawl_delay
        self.sitemaps = sitemaps or []
        self.matching_rule = matching_rule
        self.reason = reason
        self.raw_robots_txt = raw_robots_txt

    def to_dict(self) -> Dict:
        return {
            "allowed": self.allowed,
            "status_code": self.status_code,
            "crawl_delay": self.crawl_delay,
            "sitemaps": self.sitemaps,
            "matching_rule": self.matching_rule,
            "reason": self.reason
        }


def parse_robots_txt_content(content: str, target_path: str, user_agent: str = settings.BOT_NAME) -> Tuple[bool, Optional[float], List[str], Optional[str]]:
    """
    Parses robots.txt content according to Robots Exclusion Standard.
    Matches user-agent sections (specific first, then '*') and tests target_path.
    Returns: (allowed: bool, crawl_delay: Optional[float], sitemaps: List[str], matched_rule: Optional[str])
    """
    lines = content.splitlines()
    sitemaps: List[str] = []
    
    # Store agent rules: agent_name -> list of (directive, path)
    agent_rules: Dict[str, List[Tuple[str, str]]] = {}
    agent_delays: Dict[str, float] = {}
    
    current_agents: List[str] = []
    previous_key: Optional[str] = None
    
    for raw_line in lines:
        line = raw_line.split("#", 1)[0].strip()
        if not line:
            continue
            
        parts = line.split(":", 1)
        if len(parts) != 2:
            continue
            
        key = parts[0].strip().lower()
        val = parts[1].strip()
        
        if key == "user-agent":
            if previous_key is not None and previous_key != "user-agent":
                current_agents = []
            agent = val.lower()
            current_agents.append(agent)
            if agent not in agent_rules:
                agent_rules[agent] = []
        elif key == "sitemap":
            if val and val not in sitemaps:
                sitemaps.append(val)
        elif key in ("disallow", "allow"):
            for ag in current_agents:
                if ag not in agent_rules:
                    agent_rules[ag] = []
                agent_rules[ag].append((key, val))
        elif key == "crawl-delay":
            try:
                delay_val = float(val)
                for ag in current_agents:
                    agent_delays[ag] = delay_val
            except ValueError:
                pass
        
        previous_key = key
                
    target = target_path if target_path.startswith("/") else f"/{target_path}"
    
    # Check specific user agent first, then wildcard '*'
    chosen_rules: List[Tuple[str, str]] = []
    delay: Optional[float] = None
    ua_lower = user_agent.lower()
    
    if ua_lower in agent_rules:
        chosen_rules = agent_rules[ua_lower]
        delay = agent_delays.get(ua_lower)
    elif "*" in agent_rules:
        chosen_rules = agent_rules["*"]
        delay = agent_delays.get("*")
        
    if not chosen_rules:
        return True, delay, sitemaps, None
        
    # Sort rules by path length descending (most specific rule wins)
    # RFC 9309: longest match directive takes precedence; allow beats disallow on tie
    matched_rule = None
    is_allowed = True
    best_len = -1
    
    for directive, rule_path in chosen_rules:
        if not rule_path:  # Empty disallow means allow all
            if directive == "disallow" and best_len < 0:
                is_allowed = True
                matched_rule = "Disallow: (empty - allow all)"
            continue
            
        # Convert robots.txt pattern to regex
        pattern = re.escape(rule_path).replace(r"\*", ".*")
        if not pattern.endswith("$"):
            pattern = f"^{pattern}"
        else:
            pattern = f"^{pattern[:-1]}$"
            
        if re.search(pattern, target):
            rule_len = len(rule_path)
            if rule_len > best_len:
                best_len = rule_len
                is_allowed = (directive == "allow")
                matched_rule = f"{directive.capitalize()}: {rule_path}"
            elif rule_len == best_len and directive == "allow":
                # Allow wins ties
                is_allowed = True
                matched_rule = f"Allow: {rule_path}"
                
    return is_allowed, delay, sitemaps, matched_rule


async def check_robots_txt(url: str, client: Optional[httpx.AsyncClient] = None) -> RobotsTxtResult:
    """
    Fetches robots.txt for a given target URL and evaluates crawling permissions.
    """
    parsed = urlparse(url)
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    target_path = parsed.path or "/"
    if parsed.query:
        target_path = f"{target_path}?{parsed.query}"
        
    is_valid, _, error_msg = validate_url(robots_url)
    if not is_valid:
        return RobotsTxtResult(
            allowed=False,
            reason=f"Security check failed for robots.txt: {error_msg}"
        )
        
    headers = {"User-Agent": settings.DEFAULT_USER_AGENT}
    
    try:
        if client:
            resp = await client.get(robots_url, headers=headers, timeout=settings.REQUEST_TIMEOUT_SECONDS, follow_redirects=True)
        else:
            async with httpx.AsyncClient() as c:
                resp = await c.get(robots_url, headers=headers, timeout=settings.REQUEST_TIMEOUT_SECONDS, follow_redirects=True)
                
        if resp.status_code == 200:
            content = resp.text
            allowed, crawl_delay, sitemaps, matched_rule = parse_robots_txt_content(
                content, target_path, user_agent=settings.BOT_NAME
            )
            reason = (
                f"Path disallowed by robots.txt rule '{matched_rule}'"
                if not allowed
                else (f"Allowed by robots.txt ({matched_rule})" if matched_rule else "Allowed by robots.txt")
            )
            return RobotsTxtResult(
                allowed=allowed,
                status_code=resp.status_code,
                crawl_delay=crawl_delay,
                sitemaps=sitemaps,
                matching_rule=matched_rule,
                reason=reason,
                raw_robots_txt=content[:2000]
            )
        elif resp.status_code in (401, 403):
            return RobotsTxtResult(
                allowed=False,
                status_code=resp.status_code,
                reason=f"robots.txt returned HTTP {resp.status_code} (forbidden)"
            )
        elif resp.status_code == 404:
            return RobotsTxtResult(
                allowed=True,
                status_code=404,
                reason="No robots.txt found (HTTP 404), crawling permitted by default"
            )
        else:
            return RobotsTxtResult(
                allowed=True,
                status_code=resp.status_code,
                reason=f"robots.txt returned HTTP {resp.status_code}, assuming default allowed"
            )
    except Exception as e:
        return RobotsTxtResult(
            allowed=True,
            reason=f"Failed to fetch robots.txt ({str(e)}), defaulting to permitted"
        )
