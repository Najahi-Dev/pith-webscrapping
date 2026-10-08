import io
import json
import re
import zipfile
from typing import Any, Dict, List, Optional, Tuple
import pandas as pd
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Site, PageType, SiteExtraction
from app.services.engine.exporter import export_to_csv, export_to_json, export_to_xlsx, flatten_row_for_export


def sanitize_filename(name: str) -> str:
    """Replaces unsafe characters with underscores for clean file/zip entry names."""
    clean = re.sub(r"[^\w\-_.]", "_", name.strip())
    return clean or "dataset"


async def export_page_type_data(
    db: AsyncSession,
    type_id: str,
    export_format: str = "csv"
) -> Tuple[bytes, str, str]:
    """
    Exports data for a specific PageType.
    Returns: (file_bytes: bytes, media_type: str, filename: str)
    """
    pt_stmt = select(PageType).where(PageType.id == type_id)
    pt_res = await db.execute(pt_stmt)
    page_type = pt_res.scalar_one_or_none()
    if not page_type:
        raise ValueError(f"PageType with id {type_id} not found")

    ext_stmt = select(SiteExtraction).where(SiteExtraction.type_id == type_id)
    ext_res = await db.execute(ext_stmt)
    extractions = ext_res.scalars().all()

    # Collect all rows
    all_rows: List[Dict[str, Any]] = []
    for ext in extractions:
        if ext.data and isinstance(ext.data, list):
            all_rows.extend(ext.data)

    safe_name = sanitize_filename(page_type.name)

    if export_format.lower() == "json":
        json_str = export_to_json(all_rows)
        return json_str.encode("utf-8"), "application/json", f"{safe_name}.json"
    elif export_format.lower() == "xlsx":
        xlsx_bytes = export_to_xlsx(all_rows)
        return xlsx_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", f"{safe_name}.xlsx"
    else:  # csv
        csv_str = export_to_csv(all_rows)
        return csv_str.encode("utf-8"), "text/csv", f"{safe_name}.csv"


async def export_site_zip_archive(
    db: AsyncSession,
    site_id: str,
    inner_format: str = "csv"
) -> Tuple[bytes, str, str]:
    """
    Generates a ZIP archive containing separate export files for each PageType,
    along with a summary manifest.json.
    Returns: (zip_bytes: bytes, media_type: str, filename: str)
    """
    site_stmt = select(Site).where(Site.id == site_id)
    site_res = await db.execute(site_stmt)
    site = site_res.scalar_one_or_none()
    if not site:
        raise ValueError(f"Site with id {site_id} not found")

    pt_stmt = select(PageType).where(PageType.site_id == site_id)
    pt_res = await db.execute(pt_stmt)
    page_types = pt_res.scalars().all()

    zip_buffer = io.BytesIO()

    manifest = {
        "site_id": site.id,
        "domain": site.domain,
        "start_url": site.start_url,
        "page_count": site.page_count,
        "extracted_count": site.extracted_count,
        "created_at": site.created_at.isoformat() if site.created_at else None,
        "page_types": []
    }

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for pt in page_types:
            ext_stmt = select(SiteExtraction).where(SiteExtraction.type_id == pt.id)
            ext_res = await db.execute(ext_stmt)
            extractions = ext_res.scalars().all()

            all_rows: List[Dict[str, Any]] = []
            for ext in extractions:
                if ext.data and isinstance(ext.data, list):
                    all_rows.extend(ext.data)

            safe_name = sanitize_filename(pt.name)
            ext_info = {
                "id": pt.id,
                "name": pt.name,
                "pattern": pt.pattern,
                "is_listing": pt.is_listing,
                "row_count": len(all_rows)
            }
            manifest["page_types"].append(ext_info)

            if inner_format == "json":
                json_bytes = export_to_json(all_rows).encode("utf-8")
                zf.writestr(f"{safe_name}.json", json_bytes)
            elif inner_format == "xlsx":
                xlsx_bytes = export_to_xlsx(all_rows)
                zf.writestr(f"{safe_name}.xlsx", xlsx_bytes)
            else:  # csv
                csv_bytes = export_to_csv(all_rows).encode("utf-8")
                zf.writestr(f"{safe_name}.csv", csv_bytes)

        # Write manifest.json
        manifest_bytes = json.dumps(manifest, indent=2).encode("utf-8")
        zf.writestr("manifest.json", manifest_bytes)

    zip_buffer.seek(0)
    zip_filename = f"{sanitize_filename(site.domain)}_pith_export.zip"
    return zip_buffer.getvalue(), "application/zip", zip_filename
