import hashlib
import json
from typing import Any, Dict, List, Optional, Tuple


def get_row_identity_key(row: Dict[str, Any], key_field: Optional[str] = None) -> str:
    """Derives unique identity key for a row."""
    if key_field and key_field in row and row[key_field]:
        val = row[key_field]
        if isinstance(val, dict):
            return str(val.get("url") or val.get("text") or str(val))
        return str(val)
        
    # Auto-guess key: look for 'url', 'id', 'link', 'title', 'name'
    for candidate in ["url", "link", "id", "sku", "product_url", "href", "title", "name"]:
        if candidate in row and row[candidate]:
            val = row[candidate]
            if isinstance(val, dict):
                return str(val.get("url") or val.get("text") or str(val))
            return str(val)
            
    # Fallback to sorted stringified keys
    return hashlib.sha256(json.dumps(row, sort_keys=True).encode("utf-8")).hexdigest()[:16]


def compute_row_content_hash(row: Dict[str, Any]) -> str:
    """Computes a sha256 hash of all field values in a row."""
    clean_items = []
    for k, v in sorted(row.items()):
        if isinstance(v, dict):
            clean_items.append((k, str(v.get("amount") or v.get("text") or v)))
        else:
            clean_items.append((k, str(v)))
    return hashlib.sha256(json.dumps(clean_items).encode("utf-8")).hexdigest()


def compare_datasets(
    previous_rows: List[Dict[str, Any]],
    current_rows: List[Dict[str, Any]],
    key_field: Optional[str] = None,
    rules: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """
    Computes diff between previous run and current run.
    Identifies added, removed, and modified rows with field-level diffs.
    Evaluates rule conditions (e.g., price dropped, new item).
    """
    prev_map: Dict[str, Dict[str, Any]] = {}
    for r in previous_rows:
        key = get_row_identity_key(r, key_field)
        prev_map[key] = r

    curr_map: Dict[str, Dict[str, Any]] = {}
    for r in current_rows:
        key = get_row_identity_key(r, key_field)
        curr_map[key] = r

    added_rows: List[Dict[str, Any]] = []
    removed_rows: List[Dict[str, Any]] = []
    modified_rows: List[Dict[str, Any]] = []
    alerts: List[str] = []

    # 1. Detect Added & Modified
    for key, curr_row in curr_map.items():
        if key not in prev_map:
            added_rows.append(curr_row)
            # Rule: new item alert
            if rules and any(rule.get("type") == "new_item" for rule in rules):
                item_title = curr_row.get("title") or curr_row.get("name") or key
                alerts.append(f"New item added: {item_title}")
        else:
            prev_row = prev_map[key]
            # Check for changes in individual fields
            field_changes: Dict[str, Dict[str, Any]] = {}
            for field, curr_val in curr_row.items():
                prev_val = prev_row.get(field)
                if prev_val != curr_val and str(prev_val) != str(curr_val):
                    field_changes[field] = {
                        "previous": prev_val,
                        "current": curr_val
                    }

                    # Check rules (e.g. price drop)
                    if rules:
                        for rule in rules:
                            if rule.get("type") == "price_dropped" and ("price" in field.lower() or "cost" in field.lower()):
                                try:
                                    prev_amt = prev_val.get("amount") if isinstance(prev_val, dict) else float(str(prev_val).replace("$", "").replace(",", ""))
                                    curr_amt = curr_val.get("amount") if isinstance(curr_val, dict) else float(str(curr_val).replace("$", "").replace(",", ""))
                                    if curr_amt < prev_amt:
                                        item_title = curr_row.get("title") or curr_row.get("name") or key
                                        alerts.append(f"Price dropped for '{item_title}': was {prev_amt}, now {curr_amt}")
                                except Exception:
                                    pass

            if field_changes:
                modified_rows.append({
                    "key": key,
                    "row": curr_row,
                    "changes": field_changes
                })

    # 2. Detect Removed
    for key, prev_row in prev_map.items():
        if key not in curr_map:
            removed_rows.append(prev_row)
            if rules and any(rule.get("type") == "item_removed" for rule in rules):
                item_title = prev_row.get("title") or prev_row.get("name") or key
                alerts.append(f"Item removed: {item_title}")

    return {
        "key_field": key_field or "auto",
        "added_count": len(added_rows),
        "removed_count": len(removed_rows),
        "modified_count": len(modified_rows),
        "added_rows": added_rows,
        "removed_rows": removed_rows,
        "modified_rows": modified_rows,
        "alerts": alerts,
        "has_changes": (len(added_rows) + len(removed_rows) + len(modified_rows)) > 0
    }
