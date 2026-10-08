import io
import json
import gzip
import zipfile
from unittest.mock import AsyncMock, patch
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.core.database import init_db, async_session_factory
from app.models import Site, PageType, SitePage, SiteExtraction, Crawl
from app.services.site.url_normalizer import normalize_url, is_same_domain, is_crawlable_page
from app.services.site.sitemap import parse_xml_sitemap, SitemapEntry, discover_sitemaps
from app.services.site.grouping import (
    extract_url_pattern,
    infer_page_type_name,
    detect_listing_vs_detail,
    group_urls_into_types
)
from app.services.site.discovery import run_site_discovery
from app.services.site.site_runner import (
    extract_data_from_page,
    execute_site_extraction_task,
    set_site_control_flag,
    retry_failed_pages
)
from app.services.site.site_exporter import export_site_zip_archive, export_page_type_data
from app.services.engine.fetcher import FetchResult


# --- Mock Fake Site Data ---
FAKE_SITE_PAGES = {
    "https://fake-store.test/": """
        <html>
            <body>
                <header><h1>Fake Store Home</h1></header>
                <nav>
                    <a href="/category/electronics">Electronics</a>
                    <a href="/category/books">Books</a>
                    <a href="/blog/2024/launch">Launch Post</a>
                    <a href="/loop">Loop Page</a>
                    <a href="/category/electronics?utm_source=fb">Electronics Tracked</a>
                </nav>
            </body>
        </html>
    """,
    "https://fake-store.test/category/electronics": """
        <html>
            <body>
                <h1>Electronics</h1>
                <div class="product-grid">
                    <div class="card"><h3 class="title">Laptop Pro</h3><span class="price">$1,299.00</span><a href="/product/101">View</a></div>
                    <div class="card"><h3 class="title">Wireless Mouse</h3><span class="price">$49.99</span><a href="/product/102">View</a></div>
                </div>
                <a href="/product/101">Laptop Duplicate Link</a>
                <a href="/">Back Home</a>
            </body>
        </html>
    """,
    "https://fake-store.test/category/books": """
        <html>
            <body>
                <h1>Books</h1>
                <div class="product-grid">
                    <div class="card"><h3 class="title">Python Guide</h3><span class="price">$29.95</span><a href="/product/201">View</a></div>
                </div>
            </body>
        </html>
    """,
    "https://fake-store.test/product/101": """
        <html>
            <body>
                <article>
                    <h1>Laptop Pro 16</h1>
                    <p class="price">$1,299.00</p>
                    <p class="description">High performance laptop with M3 chip.</p>
                </article>
            </body>
        </html>
    """,
    "https://fake-store.test/product/102": """
        <html>
            <body>
                <article>
                    <h1>Wireless Mouse</h1>
                    <p class="price">$49.99</p>
                    <p class="description">Ergonomic precision wireless mouse.</p>
                </article>
            </body>
        </html>
    """,
    "https://fake-store.test/product/201": """
        <html>
            <body>
                <article>
                    <h1>Python Guide</h1>
                    <p class="price">$29.95</p>
                    <p class="description">Master modern Python 3.12 and async programming.</p>
                </article>
            </body>
        </html>
    """,
    "https://fake-store.test/blog/2024/launch": """
        <html>
            <body>
                <article>
                    <h1>Welcome to Fake Store</h1>
                    <p>We are excited to announce the official launch of our online catalog today.</p>
                    <p>Browse our products and find great deals.</p>
                </article>
            </body>
        </html>
    """,
    "https://fake-store.test/loop": """
        <html>
            <body>
                <h1>Loop Link Page</h1>
                <a href="/loop">Self loop</a>
                <a href="/">Back home</a>
            </body>
        </html>
    """
}

FAKE_SITEMAP_XML = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url><loc>https://fake-store.test/</loc><lastmod>2024-01-01</lastmod></url>
    <url><loc>https://fake-store.test/category/electronics</loc><lastmod>2024-01-02</lastmod></url>
    <url><loc>https://fake-store.test/product/101</loc><lastmod>2024-01-03</lastmod></url>
    <url><loc>https://fake-store.test/product/102</loc><lastmod>2024-01-03</lastmod></url>
    <url><loc>https://fake-store.test/blog/2024/launch</loc><lastmod>2024-01-04</lastmod></url>
</urlset>
"""


def test_url_normalization():
    # Test tracking params removal
    url = "https://example.com/products/42?utm_source=google&utm_medium=cpc&id=42&fbclid=XYZ#reviews"
    normalized = normalize_url(url)
    assert normalized == "https://example.com/products/42?id=42"

    # Test duplicate slashes & lowercase host
    url2 = "HTTPS://WWW.Example.com///blog//post-1"
    normalized2 = normalize_url(url2)
    assert normalized2 == "https://www.example.com/blog/post-1"

    # Test relative URL resolution
    url3 = "/category/shoes"
    normalized3 = normalize_url(url3, base_url="https://shop.com/store/index.html")
    assert normalized3 == "https://shop.com/category/shoes"


def test_crawlable_page_filters():
    # Images / PDFs / Zips should be skipped
    assert is_crawlable_page("https://example.com/image.png")[0] is False
    assert is_crawlable_page("https://example.com/doc.pdf")[0] is False
    assert is_crawlable_page("https://example.com/archive.zip")[0] is False
    assert is_crawlable_page("https://example.com/styles.css")[0] is False

    # Login / Cart / Admin should be skipped
    assert is_crawlable_page("https://example.com/login")[0] is False
    assert is_crawlable_page("https://example.com/checkout")[0] is False
    assert is_crawlable_page("https://example.com/admin/dashboard")[0] is False

    # Normal HTML pages should pass
    assert is_crawlable_page("https://example.com/products/shoes-42")[0] is True
    assert is_crawlable_page("https://example.com/about-us")[0] is True


def test_domain_matching():
    base = "https://example.com/home"
    assert is_same_domain("https://example.com/about", base, include_subdomains=False) is True
    assert is_same_domain("https://blog.example.com/post", base, include_subdomains=False) is False
    assert is_same_domain("https://blog.example.com/post", base, include_subdomains=True) is True
    assert is_same_domain("https://anotherdomain.com/post", base, include_subdomains=True) is False


def test_sitemap_xml_parsing():
    xml_content = """<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url>
            <loc>https://example.com/products/item-1</loc>
            <lastmod>2024-01-15</lastmod>
        </url>
        <url>
            <loc>https://example.com/products/item-2</loc>
            <lastmod>2024-01-16</lastmod>
        </url>
    </urlset>"""
    nested, entries = parse_xml_sitemap(xml_content)
    assert len(nested) == 0
    assert len(entries) == 2
    assert entries[0].url == "https://example.com/products/item-1"
    assert entries[0].lastmod == "2024-01-15"


def test_sitemap_index_parsing():
    xml_index = """<?xml version="1.0" encoding="UTF-8"?>
    <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <sitemap>
            <loc>https://example.com/sitemap_products.xml</loc>
        </sitemap>
        <sitemap>
            <loc>https://example.com/sitemap_blog.xml.gz</loc>
        </sitemap>
    </sitemapindex>"""
    nested, entries = parse_xml_sitemap(xml_index)
    assert len(nested) == 2
    assert "https://example.com/sitemap_products.xml" in nested
    assert "https://example.com/sitemap_blog.xml.gz" in nested


def test_pattern_extraction_and_grouping():
    urls = [
        "https://example.com/product/101",
        "https://example.com/product/102",
        "https://example.com/product/103",
        "https://example.com/blog/2024/how-to-scrape",
        "https://example.com/blog/2024/best-practices",
        "https://example.com/category/electronics",
        "https://example.com/about-us"
    ]
    groups = group_urls_into_types(urls)
    assert "/product/{id}" in groups
    assert len(groups["/product/{id}"]) == 3
    assert "/blog/{year}/{slug}" in groups
    assert len(groups["/blog/{year}/{slug}"]) == 2

    assert infer_page_type_name("/product/{id}") == "Product Detail"
    assert infer_page_type_name("/blog/{year}/{slug}") == "Blog / Article"
    assert infer_page_type_name("/category/{category}") == "Category / Collection"


def test_extract_data_from_page():
    html = """
    <div class="product-grid">
        <div class="card">
            <h3 class="title">Wireless Headphones</h3>
            <span class="price">$99.99</span>
            <a class="link" href="/item/1">View</a>
        </div>
        <div class="card">
            <h3 class="title">Smart Watch</h3>
            <span class="price">$199.50</span>
            <a class="link" href="/item/2">View</a>
        </div>
    </div>
    """
    selectors = {
        "container": ".card",
        "fields": {
            "title": ".title",
            "price": ".price",
            "link": {"selector": ".link", "attribute": "href"}
        }
    }
    rows = extract_data_from_page(html, "https://example.com/store", selectors, is_listing=True)
    assert len(rows) == 2
    assert rows[0]["title"] == "Wireless Headphones"
    assert rows[0]["price"] == "$99.99"
    assert rows[0]["link"] == "https://example.com/item/1"
    assert rows[1]["title"] == "Smart Watch"


@pytest.mark.asyncio
async def test_fake_site_discovery_and_extraction():
    """
    Full integration test against local mock site (with sitemaps, nested links, loops, duplicate URLs, and 3 page types).
    Tests discovery, deduplication, grouping, limits, extraction, and zip export.
    """
    await init_db()

    async def mock_fetch_page(url, method="http", timeout=10.0, **kwargs):
        norm = normalize_url(url) or url
        html = FAKE_SITE_PAGES.get(norm, "<html><body><h1>404</h1></body></html>")
        return FetchResult(
            url=norm,
            status_code=200 if norm in FAKE_SITE_PAGES else 404,
            html=html,
            headers={"content-type": "text/html"},
            method_used="http",
            duration_ms=5,
            content_hash="mockhash123"
        )

    async def mock_discover_sitemaps(*args, **kwargs):
        _, entries = parse_xml_sitemap(FAKE_SITEMAP_XML)
        return entries, ["https://fake-store.test/sitemap.xml"]

    with patch("app.services.site.discovery.fetch_page", side_effect=mock_fetch_page), \
         patch("app.services.site.discovery.discover_sitemaps", side_effect=mock_discover_sitemaps), \
         patch("app.services.site.site_runner.fetch_page", side_effect=mock_fetch_page):

        async with async_session_factory() as db:
            # 1. Create Site
            site = Site(
                domain="fake-store.test",
                start_url="https://fake-store.test/",
                status="pending",
                options={"max_pages": 50, "max_depth": 3, "crawl_delay": 0.0}
            )
            db.add(site)
            await db.commit()
            await db.refresh(site)

            # 2. Run Discovery
            discovery_result = await run_site_discovery(
                db=db,
                site_id=site.id,
                max_pages=50,
                max_depth=3,
                crawl_delay=0.0
            )

            assert discovery_result["status"] == "discovered"
            assert discovery_result["page_count"] >= 5
            assert discovery_result["page_types_count"] >= 3

            # Check PageTypes created
            pt_stmt = select(PageType).where(PageType.site_id == site.id)
            pt_res = await db.execute(pt_stmt)
            page_types = pt_res.scalars().all()
            patterns = [pt.pattern for pt in page_types]

            assert "/product/{id}" in patterns
            assert "/category/{category}" in patterns
            assert "/" in patterns

            # 3. Run Site Extraction
            await execute_site_extraction_task(site.id)

            # Check Site Extraction Results
            ext_stmt = select(SiteExtraction).where(SiteExtraction.site_id == site.id)
            ext_res = await db.execute(ext_stmt)
            extractions = ext_res.scalars().all()
            assert len(extractions) >= 3

            # 4. Test Export to ZIP
            zip_bytes, media_type, filename = await export_site_zip_archive(db, site.id, inner_format="csv")
            assert media_type == "application/zip"
            assert filename.endswith(".zip")
            assert len(zip_bytes) > 0

            # Verify ZIP contents
            with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
                namelist = zf.namelist()
                assert "manifest.json" in namelist
                manifest_data = json.loads(zf.read("manifest.json").decode("utf-8"))
                assert manifest_data["site_id"] == site.id
                assert len(manifest_data["page_types"]) >= 3
