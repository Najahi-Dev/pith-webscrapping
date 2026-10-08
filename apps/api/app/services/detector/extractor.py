import re
import json
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin
from selectolax.lexbor import LexborHTMLParser as HTMLParser, LexborNode as Node
import extruct
from w3lib.html import get_base_url


EMAIL_REGEX = re.compile(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+")
PHONE_REGEX = re.compile(r"(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,9}")
PRICE_REGEX = re.compile(r"(?:[\$€£¥₹]\s*[\d,]+(?:\.\d{2})?)|(?:[\d,]+(?:\.\d{2})?\s*(?:USD|EUR|GBP|INR|CAD|AUD|JPY|CNY))", re.IGNORECASE)
DATE_REGEX = re.compile(r"\b(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4})\b", re.IGNORECASE)


def extract_tables(tree: HTMLParser, base_url: str) -> List[Dict[str, Any]]:
    results = []
    tables = tree.css("table")
    for idx, table in enumerate(tables):
        rows_data = []
        headers = []
        
        # Look for thead/th
        th_elements = table.css("th")
        if th_elements:
            headers = [th.text(strip=True) or f"col_{i+1}" for i, th in enumerate(th_elements)]
            
        tr_elements = table.css("tr")
        for tr in tr_elements:
            td_elements = tr.css("td")
            if not td_elements:
                continue
                
            if not headers:
                headers = [f"col_{i+1}" for i in range(len(td_elements))]
                
            row = {}
            for col_idx, td in enumerate(td_elements):
                col_name = headers[col_idx] if col_idx < len(headers) else f"col_{col_idx+1}"
                # If cell contains link, capture text + url
                link = td.css_first("a")
                if link and link.attributes.get("href"):
                    row[col_name] = {
                        "text": td.text(strip=True),
                        "url": urljoin(base_url, link.attributes.get("href", ""))
                    }
                else:
                    row[col_name] = td.text(strip=True)
            rows_data.append(row)
            
        if rows_data:
            results.append({
                "table_index": idx + 1,
                "headers": headers,
                "row_count": len(rows_data),
                "rows": rows_data
            })
    return results


def extract_links(tree: HTMLParser, base_url: str) -> List[Dict[str, Any]]:
    links = []
    seen = set()
    for a in tree.css("a[href]"):
        href = a.attributes.get("href", "").strip()
        if not href or href.startswith("javascript:") or href.startswith("#"):
            continue
        full_url = urljoin(base_url, href)
        text = a.text(strip=True)
        if (full_url, text) in seen:
            continue
        seen.add((full_url, text))
        
        links.append({
            "text": text or "(No text)",
            "url": full_url,
            "title": a.attributes.get("title", ""),
            "rel": a.attributes.get("rel", "")
        })
    return links


def extract_images(tree: HTMLParser, base_url: str) -> List[Dict[str, Any]]:
    images = []
    seen = set()
    for img in tree.css("img[src], img[data-src], source[srcset]"):
        src = img.attributes.get("src") or img.attributes.get("data-src") or img.attributes.get("srcset", "").split(" ")[0]
        if not src or src.startswith("data:"):
            continue
        full_url = urljoin(base_url, src)
        if full_url in seen:
            continue
        seen.add(full_url)
        
        images.append({
            "src": full_url,
            "alt": img.attributes.get("alt", ""),
            "width": img.attributes.get("width", ""),
            "height": img.attributes.get("height", "")
        })
    return images


def extract_headings(tree: HTMLParser) -> List[Dict[str, Any]]:
    headings = []
    for h in tree.css("h1, h2, h3, h4, h5, h6"):
        text = h.text(strip=True)
        if text:
            headings.append({
                "level": h.tag.upper(),
                "text": text
            })
    return headings


def extract_entities(text: str) -> Dict[str, List[str]]:
    emails = list(set(EMAIL_REGEX.findall(text)))
    phones = list(set(PHONE_REGEX.findall(text)))
    # filter phones that are just single digits or years
    valid_phones = [p.strip() for p in phones if len(re.sub(r"\D", "", p)) >= 7 and len(p) <= 20]
    prices = list(set(PRICE_REGEX.findall(text)))
    dates = list(set(DATE_REGEX.findall(text)))
    
    return {
        "emails": emails[:50],
        "phone_numbers": valid_phones[:50],
        "prices": prices[:50],
        "dates": dates[:50]
    }


def extract_meta_tags(tree: HTMLParser, base_url: str) -> Dict[str, Any]:
    meta: Dict[str, Any] = {"opengraph": {}, "meta": {}}
    
    title_el = tree.css_first("title")
    meta["title"] = title_el.text(strip=True) if title_el else ""
    
    for m in tree.css("meta"):
        attrs = m.attributes
        name = attrs.get("name") or attrs.get("property")
        content = attrs.get("content")
        if name and content:
            name_lower = name.lower()
            if name_lower.startswith("og:"):
                meta["opengraph"][name_lower[3:]] = content
            elif name_lower.startswith("twitter:"):
                meta["opengraph"][name_lower] = content
            else:
                meta["meta"][name_lower] = content
                
    return meta


def extract_structured_json_ld(html: str, base_url: str) -> List[Dict[str, Any]]:
    items = []
    try:
        extracted = extruct.extract(
            html,
            base_url=base_url,
            syntaxes=["json-ld", "opengraph", "microdata"],
            errors="ignore"
        )
        json_ld_list = extracted.get("json-ld", [])
        for block in json_ld_list:
            if isinstance(block, dict):
                # Unpack @graph if present
                if "@graph" in block and isinstance(block["@graph"], list):
                    items.extend(block["@graph"])
                else:
                    items.append(block)
    except Exception:
        # Fallback to direct script tag extraction
        try:
            tree = HTMLParser(html)
            for script in tree.css('script[type="application/ld+json"]'):
                raw = script.text()
                if raw:
                    data = json.loads(raw)
                    if isinstance(data, list):
                        items.extend(data)
                    elif isinstance(data, dict):
                        if "@graph" in data and isinstance(data["@graph"], list):
                            items.extend(data["@graph"])
                        else:
                            items.append(data)
        except Exception:
            pass
            
    return items


def extract_article_content(tree: HTMLParser) -> Optional[Dict[str, Any]]:
    # Look for article container
    article = tree.css_first("article, main, [role='main'], .post-content, .article-content, #content")
    if not article:
        return None
        
    h1 = article.css_first("h1") or tree.css_first("h1")
    title = h1.text(strip=True) if h1 else ""
    
    paragraphs = [p.text(strip=True) for p in article.css("p") if len(p.text(strip=True)) > 20]
    
    if len(paragraphs) >= 2:
        return {
            "title": title,
            "paragraph_count": len(paragraphs),
            "sample_text": paragraphs[:3],
            "full_text": "\n\n".join(paragraphs)
        }
    return None
