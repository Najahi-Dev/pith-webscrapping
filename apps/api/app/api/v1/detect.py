from typing import Any, Dict, List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException
from selectolax.lexbor import LexborHTMLParser as HTMLParser
from app.services.engine.fetcher import fetch_page
from app.services.detector.extractor import (
    extract_tables, extract_links, extract_images, extract_headings,
    extract_entities, extract_meta_tags, extract_structured_json_ld,
    extract_article_content
)
from app.services.detector.pattern_engine import auto_detect_patterns


router = APIRouter()


class DetectRequest(BaseModel):
    url: str
    method: Optional[str] = "http"  # "http" or "playwright"
    html_override: Optional[str] = None


class CategoryDetectionResult(BaseModel):
    id: str
    name: str
    description: str
    count: int
    fields: List[str]
    sample_rows: List[Dict[str, Any]]
    selector: Optional[str] = None
    category_type: str  # "table", "repeating_items", "links", "images", "text", "structured_data", "entities"


class DetectResponse(BaseModel):
    url: str
    total_categories: int
    categories: List[CategoryDetectionResult]
    auto_patterns: List[Dict[str, Any]]
    meta: Dict[str, Any]


@router.post("/detect", response_model=DetectResponse)
async def detect_page_data(req: DetectRequest) -> DetectResponse:
    """
    Detects all data structures on target page:
    Tables, repeating sibling blocks (cards, products, lists), links, images, headings,
    entities (emails, phones, prices, dates), JSON-LD, and OpenGraph.
    Returns 3 sample rows per category.
    """
    target_url = req.url.strip()

    if req.html_override:
        html = req.html_override
    else:
        fetch_res = await fetch_page(target_url, method=req.method or "http")
        if fetch_res.error:
            raise HTTPException(status_code=400, detail=f"Failed to fetch page: {fetch_res.error}")
        html = fetch_res.html

    tree = HTMLParser(html)
    categories: List[CategoryDetectionResult] = []

    # 1. Auto-detected repeating pattern blocks (e.g. Products, Listing cards, Catalog items)
    patterns = auto_detect_patterns(html, target_url)
    for p in patterns:
        categories.append(
            CategoryDetectionResult(
                id=p["id"],
                name=p["name"],
                description=f"Auto-detected repeating container ({p['container_selector']})",
                count=p["count"],
                fields=p["field_names"],
                sample_rows=p["sample_rows"],
                selector=p["container_selector"],
                category_type="repeating_items"
            )
        )

    # 2. Tabular Data (<table>)
    tables = extract_tables(tree, target_url)
    for t in tables:
        sample_rows = t["rows"][:3]
        categories.append(
            CategoryDetectionResult(
                id=f"table_{t['table_index']}",
                name=f"Data Table #{t['table_index']}",
                description=f"HTML Table with columns: {', '.join(t['headers'][:5])}",
                count=t["row_count"],
                fields=t["headers"],
                sample_rows=sample_rows,
                selector=f"table:nth-of-type({t['table_index']})",
                category_type="table"
            )
        )

    # 3. Structured JSON-LD Data
    json_ld_items = extract_structured_json_ld(html, target_url)
    if json_ld_items:
        # Group by @type if present
        sample_rows = []
        for item in json_ld_items[:3]:
            # Flatten or clean item
            clean_item = {k: v for k, v in item.items() if not str(k).startswith("@context")}
            sample_rows.append(clean_item)
            
        fields = list({k: True for r in sample_rows for k in r.keys()}.keys())
        type_names = list({str(item.get("@type", "Schema")) for item in json_ld_items if isinstance(item, dict)})
        categories.append(
            CategoryDetectionResult(
                id="json_ld_schemas",
                name=f"JSON-LD Schemas ({', '.join(type_names[:3])})",
                description="Structured Schema.org metadata embedded on page",
                count=len(json_ld_items),
                fields=fields[:10],
                sample_rows=sample_rows,
                category_type="structured_data"
            )
        )

    # 4. Article & Content Blocks
    article = extract_article_content(tree)
    if article:
        sample_rows = [{"title": article["title"], "paragraph": p} for p in article["sample_text"]]
        categories.append(
            CategoryDetectionResult(
                id="article_body",
                name="Article & Text Content",
                description=f"Main textual content ({article['paragraph_count']} paragraphs)",
                count=article["paragraph_count"],
                fields=["title", "paragraph"],
                sample_rows=sample_rows,
                selector="article, main, .post-content",
                category_type="text"
            )
        )

    # 5. Media & Images
    images = extract_images(tree, target_url)
    if images:
        categories.append(
            CategoryDetectionResult(
                id="media_images",
                name="Images & Media",
                description="All visible images, thumbnails, and figures with alt text",
                count=len(images),
                fields=["src", "alt", "width", "height"],
                sample_rows=images[:3],
                selector="img",
                category_type="images"
            )
        )

    # 6. Links & Navigation
    links = extract_links(tree, target_url)
    if links:
        categories.append(
            CategoryDetectionResult(
                id="page_links",
                name="Hyperlinks & Anchors",
                description="All hyperlinks, internal navigation, and external references",
                count=len(links),
                fields=["text", "url", "title", "rel"],
                sample_rows=links[:3],
                selector="a[href]",
                category_type="links"
            )
        )

    # 7. Entities (Emails, Phones, Prices, Dates)
    text_corpus = tree.text() or ""
    entities = extract_entities(text_corpus)
    
    if entities["prices"]:
        categories.append(
            CategoryDetectionResult(
                id="entities_prices",
                name="Monetary Prices",
                description="Detected currency and price values across the document",
                count=len(entities["prices"]),
                fields=["price"],
                sample_rows=[{"price": p} for p in entities["prices"][:3]],
                category_type="entities"
            )
        )

    if entities["emails"]:
        categories.append(
            CategoryDetectionResult(
                id="entities_emails",
                name="Contact Emails",
                description="Extracted email addresses",
                count=len(entities["emails"]),
                fields=["email"],
                sample_rows=[{"email": e} for e in entities["emails"][:3]],
                category_type="entities"
            )
        )

    if entities["phone_numbers"]:
        categories.append(
            CategoryDetectionResult(
                id="entities_phones",
                name="Phone Numbers",
                description="Extracted telephone and contact numbers",
                count=len(entities["phone_numbers"]),
                fields=["phone"],
                sample_rows=[{"phone": p} for p in entities["phone_numbers"][:3]],
                category_type="entities"
            )
        )

    meta_tags = extract_meta_tags(tree, target_url)

    return DetectResponse(
        url=target_url,
        total_categories=len(categories),
        categories=categories,
        auto_patterns=patterns,
        meta=meta_tags
    )
