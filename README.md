# pith — Intelligent Web Scraping & Detection System

A developer-grade web scraping platform with a Next.js UI, FastAPI Python engine, and TypeScript SDK/CLI. Obeying ethical robots.txt policies, autonomous DOM pattern discovery, visual sandbox inspector, scheduled recipes, change alert diffing, and public REST feeds.

```
┌─────────────────────────────────────────────────────────────┐
│ [pith] Intelligent Web Scraping System                      │
│                                                             │
│ 1. URL Safety Check  → SSRF Guard, Robots.txt, Bot Walls    │
│ 2. Scrapability Score → 0-100 Gauge & Method Selection      │
│ 3. Pattern Detection  → Sibling Card Clustering & Tables    │
│ 4. Visual Inspector   → Sandboxed Iframe Hover/Click        │
│ 5. Extraction Engine  → Pagination, Deduplication, Clean    │
│ 6. Recipe Automation  → Hourly/Daily/Weekly Schedules       │
│ 7. Change Alerts      → Row Hashing, Field Diffs & Alerts   │
│ 8. Public API Feeds   → GET /v1/r/{slug}/data               │
└─────────────────────────────────────────────────────────────┘
```

---

## Stack & Architecture

- **`apps/web`**: Next.js 15 (App Router, TypeScript), Tailwind CSS, Lucide Icons, Monospace dev-tool theme (JetBrains Mono / Geist Mono).
- **`apps/api`**: FastAPI (Python 3.12), `httpx`, `selectolax` (Lexbor), `extruct`, `playwright`, `sqlalchemy`, `alembic`, `apscheduler`, `rq`, `pandas`, `openpyxl`.
- **`packages/sdk`**: Typed TypeScript client (`PithClient`) + CLI (`npx pith check|detect|run|export`).
- **`packages/ui`**: Standalone React component kit (`@pith/ui`) for URL input, checklists, scrapability meters, tables, diff viewers, and sandboxed visual frames.
- **`docker-compose.yml`**: Full-stack orchestrator for Postgres, Redis, API, Web, and Worker.

---

## Quickstart

### 1. Run Everything with Docker

```bash
docker compose up --build
```
- **Web Interface**: [http://localhost:3000](http://localhost:3000)
- **API & Swagger Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)

---

### 2. Local Development

#### API Backend (Python 3.12+)
```bash
python -m pip install -r apps/api/requirements.txt
uvicorn app.main:app --reload --port 8000 --app-dir apps/api
```

#### Run Backend Tests
```bash
pytest apps/api/tests -v
```

#### Web Frontend (Next.js)
```bash
npm install
npm run dev --workspace=apps/web
```

---

## Features

### 1. Safety & Compliance Guard
- **SSRF Protection**: Blocks loopback (`127.0.0.1`), private RFC1918 subnets (`10.0.0.0/8`, `192.168.0.0/16`, `172.16.0.0/12`), and AWS/GCP instance metadata (`169.254.169.254`). Re-validates every redirect hop.
- **Robots.txt Parser**: Respects user-agent directives (`PithBot` or `*`), disallowed paths, crawl-delays, and sitemaps.
- **ToS Prohibition Detection**: Scans landing pages for automated scraping restrictions.
- **Anti-Bot & CAPTCHA Wall Detection**: Reports Cloudflare, DataDome, PerimeterX, and reCAPTCHA as "hard".

### 2. Scrapability Scorer
- Generates a **0–100 score** with difficulty tier (`easy`, `medium`, `hard`) and automatic method recommendation (`http` for fast static DOM vs `playwright` for heavy client SPAs).

### 3. DOM Detection & Auto Patterns
- Automatically groups and counts:
  - Repeated sibling item cards (products, listings, posts) with title, price, image, link, rating, and description heuristics.
  - HTML data tables (`<table>`).
  - Structured metadata (JSON-LD schemas, OpenGraph tags).
  - Hyperlinks, images, and contact entities (emails, phone numbers, prices, dates).
  - Returns 3 sample rows per category.

### 4. Sandboxed Visual Picker
- Strips scripts and framebusters, injects `<base href>`, and loads the target page in a sandboxed iframe.
- Real-time hover outline and click-to-capture field builder with container selector detection.

### 5. Data Cleaning Pipeline
- Whitespace normalization & duplicate row removal.
- Price normalization: extracts numeric float + ISO currency (`USD`, `EUR`, `GBP`, etc.).
- Date normalization: ISO 8601 formatting (`YYYY-MM-DD`).
- Absolute URL resolution.
- Side-by-side Before & After cleaner toggle.

### 6. Recipes & Scheduled Automation
- Save scraping configurations (URL, method, selectors, pagination, cleaning, schedule).
- Run on-demand or schedule via APScheduler (`hourly`, `daily`, `weekly`, or 5-field cron).

### 7. Change Alerts & Diff Engine
- Hashes rows by identity key (`url`, `id`, `sku`, or custom key).
- Computes added, removed, and modified items with field-level before/after diffs.
- Triggers alert rules (e.g., *Price dropped*, *New item added*).

### 8. Public REST API Mode
- Serve any recipe's latest dataset directly:
```bash
GET /v1/r/{slug}/data?format=json|csv&page=1&limit=50
```

---

## TypeScript SDK & CLI

### CLI
```bash
# Check URL
npx pith check https://news.ycombinator.com

# Auto-detect structures
npx pith detect https://news.ycombinator.com

# Run extraction & save to CSV
npx pith run https://news.ycombinator.com --pages 2 --output hn.csv

# Export job dataset
npx pith export <job_id> --format xlsx --output catalog.xlsx
```

### TypeScript Client
```typescript
import { PithClient } from '@pith/sdk';

const pith = new PithClient({ baseUrl: 'http://localhost:8000' });

// Check scrapability
const check = await pith.check('https://example.com');
console.log(check.score, check.reasons);

// Extract data
const job = await pith.createJob({
  url: 'https://example.com',
  pagination: { enabled: true, max_pages: 3 }
});
const finished = await pith.waitForJob(job.id);
console.log(finished.results);
```

---

## License
MIT © Pith Systems
