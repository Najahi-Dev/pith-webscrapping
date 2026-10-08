import re
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urljoin
from dateutil import parser as date_parser


CURRENCY_SYMBOLS = {
    "$": "USD",
    "€": "EUR",
    "£": "GBP",
    "¥": "JPY",
    "₹": "INR",
    "₩": "KRW",
    "₽": "RUB",
    "C$": "CAD",
    "A$": "AUD",
    "Fr": "CHF"
}


def clean_whitespace(val: Any) -> Any:
    if isinstance(val, str):
        # Trim leading/trailing and collapse multiple whitespace into single space
        return re.sub(r"\s+", " ", val).strip()
    elif isinstance(val, dict):
        return {k: clean_whitespace(v) for k, v in val.items()}
    elif isinstance(val, list):
        return [clean_whitespace(x) for x in val]
    return val


def normalize_price(val: Any) -> Any:
    """
    Parses strings like '$1,299.99', '49.00 EUR', '£ 12' into:
    {'amount': 1299.99, 'currency': 'USD', 'formatted': '$1,299.99'} or clean float.
    """
    if not isinstance(val, str) or not val:
        return val

    text = val.strip()
    # Check for currency symbols or ISO codes
    currency = "USD"
    for symbol, code in CURRENCY_SYMBOLS.items():
        if symbol in text:
            currency = code
            break
    for iso_code in ["USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY", "CNY"]:
        if iso_code in text.upper():
            currency = iso_code
            break

    # Extract numeric value
    # Handle numbers with commas and decimals (e.g. 1,234.56 or 1.234,56)
    match = re.search(r"[\d]+(?:[.,]\d{3})*(?:[.,]\d{1,2})?", text)
    if match:
        num_str = match.group(0)
        # Normalize European style decimals (1.299,00 -> 1299.00)
        if "," in num_str and "." in num_str:
            if num_str.rfind(",") > num_str.rfind("."):
                num_str = num_str.replace(".", "").replace(",", ".")
            else:
                num_str = num_str.replace(",", "")
        elif "," in num_str:
            # Check if comma is decimal or thousand separator
            parts = num_str.split(",")
            if len(parts) == 2 and len(parts[1]) == 2:
                num_str = num_str.replace(",", ".")
            else:
                num_str = num_str.replace(",", "")

        try:
            amount = float(num_str)
            return {
                "amount": amount,
                "currency": currency,
                "raw": text
            }
        except ValueError:
            pass

    return val


def normalize_date(val: Any) -> Any:
    """
    Parses ambiguous date strings into ISO 8601 YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ.
    """
    if not isinstance(val, str) or not val:
        return val

    text = val.strip()
    # Don't parse short numbers as dates
    if text.isdigit() and len(text) < 5:
        return val

    try:
        dt = date_parser.parse(text, fuzzy=True)
        # If time is 00:00:00 and no time text present, format as YYYY-MM-DD
        if dt.hour == 0 and dt.minute == 0 and dt.second == 0 and "00:" not in text:
            return dt.strftime("%Y-%m-%d")
        return dt.isoformat()
    except Exception:
        return val


def normalize_url(val: Any, base_url: str) -> Any:
    if isinstance(val, str) and (val.startswith("/") or val.startswith("./") or val.startswith("../")):
        return urljoin(base_url, val)
    elif isinstance(val, dict):
        return {k: normalize_url(v, base_url) for k, v in val.items()}
    return val


def clean_dataset(
    rows: List[Dict[str, Any]],
    base_url: str = "",
    trim_whitespace_enabled: bool = True,
    remove_duplicates_enabled: bool = True,
    normalize_prices_enabled: bool = True,
    normalize_dates_enabled: bool = True,
    make_urls_absolute_enabled: bool = True,
    key_field: Optional[str] = None
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Applies data cleaning rules to raw extracted rows.
    Returns: (cleaned_rows, cleaning_stats)
    """
    cleaned: List[Dict[str, Any]] = []
    seen_keys = set()
    duplicates_removed = 0
    prices_normalized = 0
    dates_normalized = 0
    urls_normalized = 0

    for row in rows:
        processed_row = {}
        for col, val in row.items():
            curr_val = val

            # 1. Whitespace
            if trim_whitespace_enabled:
                curr_val = clean_whitespace(curr_val)

            # 2. URLs
            if make_urls_absolute_enabled and base_url:
                prev_val = curr_val
                curr_val = normalize_url(curr_val, base_url)
                if prev_val != curr_val:
                    urls_normalized += 1

            # 3. Prices
            if normalize_prices_enabled:
                col_lower = col.lower()
                if "price" in col_lower or "cost" in col_lower or "amount" in col_lower or (isinstance(curr_val, str) and any(s in curr_val for s in CURRENCY_SYMBOLS)):
                    prev_val = curr_val
                    curr_val = normalize_price(curr_val)
                    if prev_val != curr_val:
                        prices_normalized += 1

            # 4. Dates
            if normalize_dates_enabled:
                col_lower = col.lower()
                if "date" in col_lower or "time" in col_lower or "published" in col_lower or "created" in col_lower:
                    prev_val = curr_val
                    curr_val = normalize_date(curr_val)
                    if prev_val != curr_val:
                        dates_normalized += 1

            processed_row[col] = curr_val

        # 5. Duplicates Check
        if remove_duplicates_enabled:
            if key_field and key_field in processed_row:
                row_key = str(processed_row[key_field])
            else:
                # Hash full row values
                row_key = str(sorted([(k, str(v)) for k, v in processed_row.items()]))

            if row_key in seen_keys:
                duplicates_removed += 1
                continue
            seen_keys.add(row_key)

        cleaned.append(processed_row)

    stats = {
        "original_count": len(rows),
        "cleaned_count": len(cleaned),
        "duplicates_removed": duplicates_removed,
        "prices_normalized": prices_normalized,
        "dates_normalized": dates_normalized,
        "urls_normalized": urls_normalized
    }

    return cleaned, stats
