import io
import json
import csv
from typing import Any, Dict, List
import pandas as pd


def flatten_row_for_export(row: Dict[str, Any]) -> Dict[str, Any]:
    flat = {}
    for k, v in row.items():
        if isinstance(v, dict):
            # If price object with amount, extract amount
            if "amount" in v and "currency" in v:
                flat[k] = f"{v.get('currency', '')} {v.get('amount', '')}".strip()
            elif "url" in v and "text" in v:
                flat[k] = v.get("text", "")
                flat[f"{k}_url"] = v.get("url", "")
            else:
                flat[k] = json.dumps(v, ensure_ascii=False)
        elif isinstance(v, list):
            flat[k] = ", ".join(str(x) for x in v)
        else:
            flat[k] = v
    return flat


def export_to_csv(rows: List[Dict[str, Any]]) -> str:
    """Returns CSV string from list of dicts."""
    if not rows:
        return ""
    
    flat_rows = [flatten_row_for_export(r) for r in rows]
    # Collect all unique fieldnames
    fieldnames = list({k: True for r in flat_rows for k in r.keys()}.keys())
    
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=fieldnames, lineterminator="\n")
    writer.writeheader()
    writer.writerows(flat_rows)
    return output.getvalue()


def export_to_json(rows: List[Dict[str, Any]]) -> str:
    """Returns formatted JSON string from list of dicts."""
    return json.dumps(rows, indent=2, ensure_ascii=False)


def export_to_xlsx(rows: List[Dict[str, Any]]) -> bytes:
    """Returns Excel binary bytes from list of dicts."""
    flat_rows = [flatten_row_for_export(r) for r in rows]
    df = pd.DataFrame(flat_rows)
    
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Extracted Data")
    return output.getvalue()
