# @pith/ui

Reusable React components with high-density dev-tool aesthetic (monospace typography, 4px grid, dark/light theme, Lucide icons) for data extraction and scraping interfaces.

## Components Included

- `<UrlInput />`: Smart URL input with protocol prefix, validation state, and submit action.
- `<CheckList />`: Compliance checklist with pass/fail/warn indicators for SSRF, robots.txt, bot blocks, and ToS.
- `<ScrapabilityBadge />`: 0–100 score gauge with difficulty level badge and engine indicator.
- `<CategoryCard />`: Detected data category card with field list, count badge, and sample rows inspector.
- `<DataPreviewTable />`: Virtualized/paginated data table with before/after cleaner toggle, text search filter, and CSV/JSON/XLSX export.
- `<VisualPickerFrame />`: Sandboxed iframe inspector with element hover highlights and click-to-capture field builder.
- `<DiffViewer />`: Added, removed, and modified row comparison tool with field-level diff highlights.
- `<Button />`: Dev-tool tactile button primitive.

## Installation

```bash
npm install @pith/ui lucide-react
```

## License
MIT
