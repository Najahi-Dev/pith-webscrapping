import asyncio
import datetime
from typing import Any, Dict, List, Optional
from selectolax.lexbor import LexborHTMLParser as HTMLParser
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Job, Recipe, ChangeRecord
from app.services.engine.fetcher import fetch_page
from app.services.engine.pagination import detect_next_page_url
from app.services.engine.cleaner import clean_dataset
from app.services.detector.extractor import (
    extract_tables, extract_links, extract_images, extract_headings,
    extract_entities, extract_structured_json_ld, extract_article_content
)
from app.services.detector.pattern_engine import auto_detect_patterns
from app.services.alerts.diff_engine import compare_datasets


def extract_rows_from_selectors(
    tree: HTMLParser,
    base_url: str,
    container_selector: Optional[str],
    fields: Dict[str, Any]
) -> List[Dict[str, Any]]:
    """
    Extracts structured rows given a container CSS selector and a dict of field configs.
    """
    rows = []
    if container_selector:
        containers = tree.css(container_selector)
        for node in containers:
            row = {}
            for f_name, f_def in fields.items():
                if isinstance(f_def, str):
                    sel = f_def
                    attr = "text"
                elif isinstance(f_def, dict):
                    sel = f_def.get("selector", "")
                    attr = f_def.get("attribute", "text")
                else:
                    continue

                if not sel:
                    continue

                target_el = node.css_first(sel) if sel != "." and sel != "self" else node
                if not target_el:
                    row[f_name] = None
                    continue

                if attr == "src":
                    val = target_el.attributes.get("src") or target_el.attributes.get("data-src") or ""
                    row[f_name] = val
                elif attr == "href":
                    val = target_el.attributes.get("href") or ""
                    row[f_name] = val
                elif attr.startswith("attr:"):
                    attr_name = attr.split(":", 1)[1]
                    row[f_name] = target_el.attributes.get(attr_name, "")
                else:
                    row[f_name] = target_el.text(strip=True)

            if any(v is not None and str(v).strip() != "" for v in row.values()):
                rows.append(row)
    else:
        # Single element or page-level extraction
        row = {}
        for f_name, f_def in fields.items():
            sel = f_def if isinstance(f_def, str) else f_def.get("selector", "")
            target_el = tree.css_first(sel)
            row[f_name] = target_el.text(strip=True) if target_el else None
        if any(v for v in row.values()):
            rows.append(row)

    return rows


async def execute_extraction_job(
    job_id: str,
    session: AsyncSession
) -> None:
    """
    Asynchronously executes an extraction job. Updates progress and saves final extracted rows to database.
    """
    stmt = select(Job).where(Job.id == job_id)
    res = await session.execute(stmt)
    job = res.scalar_one_or_none()
    if not job:
        return

    job.status = "running"
    job.progress = {"current_page": 1, "max_pages": 1, "rows_extracted": 0, "percent": 10, "message": "Fetching starting page"}
    await session.commit()

    options = job.options or {}
    start_url = job.url
    method = job.method or options.get("method", "http")
    category_id = options.get("category_id")
    selectors_cfg = options.get("selectors") or {}
    pagination_cfg = options.get("pagination") or {"enabled": False, "max_pages": 1}
    cleaning_rules = options.get("cleaning_rules") or {
        "trim_whitespace": True,
        "remove_duplicates": True,
        "normalize_prices": True,
        "normalize_dates": True,
        "make_urls_absolute": True
    }

    max_pages = min(pagination_cfg.get("max_pages", 1), 50) if pagination_cfg.get("enabled") else 1
    
    current_url = start_url
    pages_crawled = 0
    raw_rows: List[Dict[str, Any]] = []
    seen_page_hashes = set()
    start_time = asyncio.get_event_loop().time()

    try:
        while current_url and pages_crawled < max_pages:
            pages_crawled += 1
            percent = int((pages_crawled / max_pages) * 80)
            job.progress = {
                "current_page": pages_crawled,
                "max_pages": max_pages,
                "rows_extracted": len(raw_rows),
                "percent": percent,
                "message": f"Crawling page {pages_crawled} of {max_pages}"
            }
            await session.commit()

            fetch_res = await fetch_page(current_url, method=method)
            if fetch_res.error:
                if pages_crawled == 1:
                    raise Exception(f"Failed to fetch initial page: {fetch_res.error}")
                else:
                    break

            if fetch_res.content_hash in seen_page_hashes:
                # Duplicate page encountered, stop pagination loop
                break
            seen_page_hashes.add(fetch_res.content_hash)

            tree = HTMLParser(fetch_res.html)

            # 1. Custom or Visual Selectors
            if selectors_cfg and selectors_cfg.get("fields"):
                container_sel = selectors_cfg.get("container")
                fields_map = selectors_cfg.get("fields", {})
                extracted = extract_rows_from_selectors(tree, current_url, container_sel, fields_map)
                raw_rows.extend(extracted)

            # 2. Built-in Category Extraction
            elif category_id:
                if category_id.startswith("table_"):
                    tables = extract_tables(tree, current_url)
                    t_idx = int(category_id.replace("table_", "")) - 1
                    if 0 <= t_idx < len(tables):
                        raw_rows.extend(tables[t_idx]["rows"])
                elif category_id == "media_images":
                    imgs = extract_images(tree, current_url)
                    raw_rows.extend(imgs)
                elif category_id == "page_links":
                    lnks = extract_links(tree, current_url)
                    raw_rows.extend(lnks)
                elif category_id == "entities_prices":
                    ent = extract_entities(tree.text() or "")
                    raw_rows.extend([{"price": p} for p in ent["prices"]])
                elif category_id == "entities_emails":
                    ent = extract_entities(tree.text() or "")
                    raw_rows.extend([{"email": e} for e in ent["emails"]])
                elif category_id == "entities_phones":
                    ent = extract_entities(tree.text() or "")
                    raw_rows.extend([{"phone": p} for p in ent["phone_numbers"]])
                elif category_id == "json_ld_schemas":
                    schemas = extract_structured_json_ld(fetch_res.html, current_url)
                    raw_rows.extend(schemas)
                elif category_id == "article_body":
                    art = extract_article_content(tree)
                    if art:
                        raw_rows.extend([{"title": art["title"], "paragraph": p} for p in art["sample_text"]])
                else:
                    # Auto pattern fallback
                    patterns = auto_detect_patterns(fetch_res.html, current_url)
                    matched_pattern = next((p for p in patterns if p["id"] == category_id), None)
                    if matched_pattern:
                        extracted = extract_rows_from_selectors(
                            tree, current_url, matched_pattern["container_selector"], matched_pattern["fields"]
                        )
                        raw_rows.extend(extracted)
            else:
                # Default: auto-detect best pattern or tables
                patterns = auto_detect_patterns(fetch_res.html, current_url)
                if patterns:
                    p = patterns[0]
                    extracted = extract_rows_from_selectors(tree, current_url, p["container_selector"], p["fields"])
                    raw_rows.extend(extracted)
                else:
                    tables = extract_tables(tree, current_url)
                    if tables:
                        raw_rows.extend(tables[0]["rows"])

            # Check for next page link if pagination requested
            if pagination_cfg.get("enabled") and pages_crawled < max_pages:
                next_url = detect_next_page_url(fetch_res.html, current_url)
                if not next_url or next_url == current_url:
                    break
                current_url = next_url
            else:
                break

        # 3. Apply Data Cleaning Pipeline
        cleaned_rows, cleaning_stats = clean_dataset(
            rows=raw_rows,
            base_url=start_url,
            trim_whitespace_enabled=cleaning_rules.get("trim_whitespace", True),
            remove_duplicates_enabled=cleaning_rules.get("remove_duplicates", True),
            normalize_prices_enabled=cleaning_rules.get("normalize_prices", True),
            normalize_dates_enabled=cleaning_rules.get("normalize_dates", True),
            make_urls_absolute_enabled=cleaning_rules.get("make_urls_absolute", True),
            key_field=options.get("key_field")
        )

        columns = list({k: True for r in cleaned_rows for k in r.keys()}.keys()) if cleaned_rows else []
        duration_ms = int((asyncio.get_event_loop().time() - start_time) * 1000)

        job.status = "completed"
        job.raw_results = raw_rows
        job.results = cleaned_rows
        job.columns = columns
        job.row_count = len(cleaned_rows)
        job.duration_ms = duration_ms
        job.completed_at = datetime.datetime.now(datetime.timezone.utc)
        job.progress = {
            "current_page": pages_crawled,
            "max_pages": max_pages,
            "rows_extracted": len(cleaned_rows),
            "percent": 100,
            "message": f"Extraction complete: {len(cleaned_rows)} rows across {pages_crawled} page(s)"
        }

        # 4. If linked to a Recipe, run Change Alerts & Diff Engine
        if job.recipe_id:
            recipe_stmt = select(Recipe).where(Recipe.id == job.recipe_id)
            recipe_res = await session.execute(recipe_stmt)
            recipe = recipe_res.scalar_one_or_none()
            if recipe:
                recipe.last_run_at = job.completed_at
                recipe.last_status = "completed"
                recipe.last_row_count = len(cleaned_rows)

                # Get previous completed job for this recipe
                prev_stmt = (
                    select(Job)
                    .where(Job.recipe_id == recipe.id, Job.id != job.id, Job.status == "completed")
                    .order_by(desc(Job.created_at))
                    .limit(1)
                )
                prev_res = await session.execute(prev_stmt)
                prev_job = prev_res.scalar_one_or_none()

                if prev_job and prev_job.results:
                    alert_cfg = recipe.alert_rules or {}
                    key_field = alert_cfg.get("key_field")
                    rules_list = alert_cfg.get("rules", [])
                    diff_res = compare_datasets(
                        previous_rows=prev_job.results,
                        current_rows=cleaned_rows,
                        key_field=key_field,
                        rules=rules_list
                    )

                    if diff_res["has_changes"]:
                        change_record = ChangeRecord(
                            recipe_id=recipe.id,
                            job_id=job.id,
                            hash_key_field=diff_res["key_field"],
                            added_count=diff_res["added_count"],
                            removed_count=diff_res["removed_count"],
                            modified_count=diff_res["modified_count"],
                            diff_summary=diff_res,
                            alert_triggered=len(diff_res["alerts"]) > 0,
                            alert_messages=diff_res["alerts"]
                        )
                        session.add(change_record)

        await session.commit()

    except Exception as e:
        duration_ms = int((asyncio.get_event_loop().time() - start_time) * 1000)
        job.status = "failed"
        job.error_message = str(e)
        job.duration_ms = duration_ms
        job.progress = {
            "current_page": pages_crawled,
            "max_pages": max_pages,
            "rows_extracted": len(raw_rows),
            "percent": 100,
            "message": f"Error: {str(e)}"
        }
        await session.commit()
