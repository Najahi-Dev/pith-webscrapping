# @pith/sdk

Official TypeScript SDK and CLI for the **Pith** intelligent web scraping system.

## Installation

```bash
npm install @pith/sdk
```

Or run directly via `npx`:

```bash
npx @pith/sdk check https://example.com
```

## CLI Usage

### 1. Check Scrapability & Safety Guard
```bash
npx pith check https://news.ycombinator.com
```
Checks SSRF protection, parses robots.txt, detects bot protection / login walls, and outputs a 0–100 score.

### 2. Auto-Detect Page Data Patterns
```bash
npx pith detect https://news.ycombinator.com
```
Discovers tables, repeating sibling cards, links, images, headings, and schema metadata.

### 3. Run Extraction Job
```bash
npx pith run https://news.ycombinator.com --pages 2 --output hn.json
```

### 4. Export Finished Job
```bash
npx pith export <job_id> --format csv --output hn_export.csv
```

## TypeScript SDK Usage

```typescript
import { PithClient } from '@pith/sdk';

const pith = new PithClient({
  baseUrl: 'http://localhost:8000',
  apiKey: 'pith_live_...',
});

// 1. Check safety & score
const checkResult = await pith.check('https://example.com');
console.log('Score:', checkResult.score, 'Method:', checkResult.recommended_method);

// 2. Discover structures
const detected = await pith.detect('https://example.com');
console.log('Found categories:', detected.categories.map(c => c.name));

// 3. Start extraction job
const job = await pith.createJob({
  url: 'https://example.com',
  method: 'http',
  pagination: { enabled: true, max_pages: 3 },
  cleaning_rules: {
    trim_whitespace: true,
    remove_duplicates: true,
    normalize_prices: true,
  },
});

// 4. Wait for completion
const finished = await pith.waitForJob(job.id);
console.log('Extracted rows:', finished.results);
```

## License
MIT
