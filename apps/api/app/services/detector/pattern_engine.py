import re
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urljoin
from selectolax.lexbor import LexborHTMLParser as HTMLParser, LexborNode as Node


FIELD_HEURISTICS = [
    ("title", ["h1", "h2", "h3", "h4", "h5", ".title", ".name", "[class*='title']", "[class*='name']", "[class*='heading']", "strong", "b"]),
    ("price", [".price", ".amount", ".cost", "[class*='price']", "[class*='amount']", "[class*='cost']", ".currency", ".sale-price"]),
    ("link", ["a[href]"]),
    ("image", ["img[src]", "img[data-src]", "source[srcset]"]),
    ("description", ["p", ".desc", ".description", ".summary", ".snippet", "[class*='desc']", "[class*='summary']", "[class*='snippet']", "[class*='detail']"]),
    ("rating", [".rating", ".stars", ".review-score", "[class*='rating']", "[class*='stars']", "[class*='score']"]),
    ("category", [".category", ".tag", ".badge", ".genre", "[class*='category']", "[class*='tag']", "[class*='badge']"]),
    ("date", ["time", ".date", ".published", "[class*='date']", "[class*='time']"]),
    ("author", [".author", ".byline", "[class*='author']", "[rel='author']"]),
]


def clean_selector_class(class_str: str) -> str:
    """Extracts the cleanest, most stable CSS class from class attribute."""
    if not class_str:
        return ""
    classes = class_str.strip().split()
    # Filter out utility/dynamic classes (e.g. Tailwind active states or random hashes)
    filtered = []
    for c in classes:
        if c.startswith("hover:") or c.startswith("focus:") or c.startswith("dark:") or ":" in c:
            continue
        if len(c) > 35 and re.search(r"[0-9a-f]{8,}", c):
            continue
        filtered.append(c)
    if filtered:
        return "." + ".".join(filtered[:2])
    return ""


def get_element_fingerprint(node: Node) -> str:
    """Generates a structural signature of a node based on its tag and direct children tags."""
    tag = node.tag or ""
    class_part = clean_selector_class(node.attributes.get("class", ""))
    children_tags = "-".join(sorted([child.tag for child in node.iter() if child.tag and child != node][:6]))
    return f"{tag}{class_part}:{children_tags}"


def auto_detect_patterns(html: str, base_url: str) -> List[Dict[str, Any]]:
    """
    Scans the DOM for repeated sibling blocks (e.g. product cards, table rows, listing items)
    and automatically derives container selectors and child field selectors.
    """
    if not html:
        return []

    tree = HTMLParser(html)
    patterns: List[Dict[str, Any]] = []
    
    # Common container candidate selectors
    candidate_queries = [
        ("Product / Catalog Cards", [
            "[class*='product']", "[class*='card']", "[class*='item']", "[class*='listing']",
            "[class*='grid-item']", "[class*='tile']", "[data-testid*='product']", "[data-testid*='card']",
            "article", ".entry", ".result", ".post"
        ]),
        ("List Items", [
            "ul > li", "ol > li", ".list-group-item"
        ]),
        ("Table Rows", [
            "table tbody tr", "table tr"
        ])
    ]
    
    seen_containers = set()

    for group_name, query_list in candidate_queries:
        for query in query_list:
            nodes = tree.css(query)
            if len(nodes) < 2:
                continue

            # Check if these nodes share a common parent or structure
            first_node = nodes[0]
            container_tag = first_node.tag
            container_cls = clean_selector_class(first_node.attributes.get("class", ""))
            
            # Determine canonical container selector
            if query.startswith("table"):
                container_selector = query
            elif container_cls:
                container_selector = f"{container_tag}{container_cls}"
            else:
                container_selector = query

            if container_selector in seen_containers:
                continue
                
            matching_elements = tree.css(container_selector)
            if len(matching_elements) < 2:
                continue

            seen_containers.add(container_selector)

            # Discover child fields across the first few nodes
            field_selectors: Dict[str, Dict[str, Any]] = {}
            sample_rows: List[Dict[str, Any]] = []

            # 1. Determine field selectors using heuristics
            for field_name, selectors in FIELD_HEURISTICS:
                for sel in selectors:
                    found_in_samples = 0
                    for sample_node in matching_elements[:5]:
                        match = sample_node.css_first(sel)
                        if match:
                            found_in_samples += 1
                    
                    if found_in_samples >= min(2, len(matching_elements)):
                        # Found a reliable field
                        attr_to_extract = "text"
                        if field_name == "image":
                            attr_to_extract = "src"
                        elif field_name == "link":
                            attr_to_extract = "href"
                            
                        field_selectors[field_name] = {
                            "selector": sel,
                            "attribute": attr_to_extract,
                            "type": "string" if field_name != "price" else "currency"
                        }
                        break

            # 2. Extract sample rows (up to 5 rows)
            for node in matching_elements[:5]:
                row = {}
                for f_name, f_cfg in field_selectors.items():
                    sel = f_cfg["selector"]
                    attr = f_cfg["attribute"]
                    child = node.css_first(sel)
                    if not child:
                        row[f_name] = None
                        continue
                        
                    if attr == "text":
                        row[f_name] = child.text(strip=True)
                    elif attr == "src":
                        src = child.attributes.get("src") or child.attributes.get("data-src") or ""
                        row[f_name] = urljoin(base_url, src) if src else None
                    elif attr == "href":
                        href = child.attributes.get("href") or ""
                        row[f_name] = urljoin(base_url, href) if href else None
                
                # If row has at least one non-empty value, add it
                if any(v for v in row.values()):
                    sample_rows.append(row)

            if len(sample_rows) >= 2 and len(field_selectors) >= 1:
                # Assign descriptive label
                title_candidates = [r.get("title") for r in sample_rows if r.get("title")]
                suggested_name = f"{group_name} ({container_selector})"
                if "product" in container_selector.lower():
                    suggested_name = "Product Listings"
                elif "table" in container_selector.lower():
                    suggested_name = "Data Table Rows"
                elif "article" in container_selector.lower() or "post" in container_selector.lower():
                    suggested_name = "Articles & Posts"
                elif "list" in container_selector.lower() or "li" in container_selector.lower():
                    suggested_name = "Structured List Items"

                patterns.append({
                    "id": f"pattern_{len(patterns) + 1}",
                    "name": suggested_name,
                    "category": "repeating_items",
                    "container_selector": container_selector,
                    "count": len(matching_elements),
                    "fields": field_selectors,
                    "field_names": list(field_selectors.keys()),
                    "sample_rows": sample_rows[:3]
                })

    return patterns
