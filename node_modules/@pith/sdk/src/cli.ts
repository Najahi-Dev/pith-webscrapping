#!/usr/bin/env node
import { PithClient } from './client';
import * as fs from 'fs';

const pith = new PithClient({
  baseUrl: process.env.PITH_API_URL || 'http://localhost:8000',
  apiKey: process.env.PITH_API_KEY,
});

function printBanner() {
  console.log('\x1b[32m[pith]\x1b[0m Intelligent Web Scraping & Detection System v1.0.0');
}

function parseCustomHeaders(flags: Record<string, string>): Record<string, string> | undefined {
  const headerStr = flags['--header'] || flags['-H'];
  if (!headerStr) return undefined;
  const headers: Record<string, string> = {};
  const pairs = headerStr.split(';;');
  for (const p of pairs) {
    const splitIdx = p.indexOf(':');
    if (splitIdx !== -1) {
      const k = p.slice(0, splitIdx).trim();
      const v = p.slice(splitIdx + 1).trim();
      if (k) headers[k] = v;
    }
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}

async function handleCheck(url: string, flags: Record<string, string>) {
  if (!url) {
    console.error('\x1b[31mError:\x1b[0m URL is required. Usage: pith check <url>');
    process.exit(1);
  }
  const customHeaders = parseCustomHeaders(flags);
  console.log(`\x1b[90m→ Checking scrapability and safety for:\x1b[0m ${url}`);
  if (customHeaders) {
    console.log(`\x1b[90m→ Using ${Object.keys(customHeaders).length} custom request header(s)\x1b[0m\n`);
  } else {
    console.log('');
  }

  try {
    const res = await pith.check(url, customHeaders);
    const scoreColor = res.score >= 75 ? '\x1b[32m' : res.score >= 45 ? '\x1b[33m' : '\x1b[31m';
    
    console.log(`Score:  ${scoreColor}${res.score}/100 [${res.level.toUpperCase()}]\x1b[0m`);
    console.log(`Engine: \x1b[36m${res.recommended_method.toUpperCase()}\x1b[0m`);
    console.log(`Status: ${res.allowed ? '\x1b[32mALLOWED\x1b[0m' : '\x1b[31mRESTRICTED\x1b[0m'}\n`);

    console.log('SAFETY & COMPLIANCE CHECKLIST:');
    res.checklist.forEach((item) => {
      const icon = item.status === 'pass' ? '\x1b[32m[PASS]\x1b[0m' : item.status === 'warn' ? '\x1b[33m[WARN]\x1b[0m' : '\x1b[31m[FAIL]\x1b[0m';
      console.log(`  ${icon} ${item.label.padEnd(28)} : ${item.details}`);
    });

    console.log('\nREASONS:');
    res.reasons.forEach((r) => console.log(`  • ${r}`));
  } catch (err: any) {
    console.error(`\x1b[31mError:\x1b[0m ${err.message}`);
    process.exit(1);
  }
}

async function handleDetect(url: string, flags: Record<string, string>) {
  if (!url) {
    console.error('\x1b[31mError:\x1b[0m URL is required. Usage: pith detect <url>');
    process.exit(1);
  }
  console.log(`\x1b[90m→ Discovering data patterns for:\x1b[0m ${url}\n`);

  try {
    const res = await pith.detect(url, {
      method: (flags['--method'] as any) || 'http',
    });
    console.log(`Found \x1b[32m${res.total_categories}\x1b[0m categories and structures:\n`);

    res.categories.forEach((cat, idx) => {
      console.log(`[${idx + 1}] \x1b[1m${cat.name}\x1b[0m (${cat.count} items, type: ${cat.category_type})`);
      if (cat.selector) console.log(`    Selector: \x1b[36m${cat.selector}\x1b[0m`);
      console.log(`    Fields:   ${cat.fields.join(', ')}`);
      if (cat.sample_rows.length > 0) {
        console.log(`    Sample 1: ${JSON.stringify(cat.sample_rows[0]).slice(0, 120)}...`);
      }
      console.log('');
    });
  } catch (err: any) {
    console.error(`\x1b[31mError:\x1b[0m ${err.message}`);
    process.exit(1);
  }
}

async function handleRun(target: string, flags: Record<string, string>) {
  if (!target) {
    console.error('\x1b[31mError:\x1b[0m Target URL or Recipe ID is required. Usage: pith run <url|recipe_id>');
    process.exit(1);
  }

  const customHeaders = parseCustomHeaders(flags);
  const isUrl = target.startsWith('http://') || target.startsWith('https://');
  console.log(`\x1b[90m→ Starting extraction for:\x1b[0m ${target}`);

  try {
    let job;
    if (isUrl) {
      job = await pith.createJob({
        url: target,
        method: (flags['--method'] as any) || 'http',
        category_id: flags['--category'],
        pagination: {
          enabled: flags['--pages'] ? true : false,
          max_pages: flags['--pages'] ? parseInt(flags['--pages'], 10) : 1,
        },
        custom_headers: customHeaders,
      });
    } else {
      const res = await pith.runRecipe(target);
      job = await pith.getJob(res.job_id);
    }

    console.log(`Job created: \x1b[36m${job.id}\x1b[0m`);
    console.log('Running extraction in background...');

    const finishedJob = await pith.waitForJob(job.id, 1000, 120000, (p) => {
      process.stdout.write(`\r[${p.percent}%] Page ${p.current_page}/${p.max_pages} - ${p.rows_extracted} rows extracted - ${p.message}    `);
    });

    console.log(`\n\n\x1b[32m✔ Job completed in ${finishedJob.duration_ms}ms!\x1b[0m`);
    console.log(`Extracted: \x1b[1m${finishedJob.row_count}\x1b[0m rows`);
    console.log(`Columns:   ${finishedJob.columns.join(', ')}`);

    const outputFile = flags['--output'] || flags['-o'];
    if (outputFile) {
      const format = outputFile.endsWith('.csv') ? 'csv' : 'json';
      const data = await pith.exportJob(finishedJob.id, format);
      fs.writeFileSync(outputFile, data, 'utf-8');
      console.log(`\x1b[32m✔ Saved results to:\x1b[0m ${outputFile}`);
    } else if (finishedJob.results && finishedJob.results.length > 0) {
      console.log('\nFirst 3 rows:');
      console.dir(finishedJob.results.slice(0, 3), { depth: 3, colors: true });
    }
  } catch (err: any) {
    console.error(`\n\x1b[31mError:\x1b[0m ${err.message}`);
    process.exit(1);
  }
}

async function handleExport(jobId: string, flags: Record<string, string>) {
  if (!jobId) {
    console.error('\x1b[31mError:\x1b[0m Job ID is required. Usage: pith export <job_id>');
    process.exit(1);
  }

  const format = (flags['--format'] as any) || (flags['-f'] as any) || 'json';
  const outputFile = flags['--output'] || flags['-o'] || `pith_export_${jobId.slice(0, 8)}.${format}`;

  try {
    console.log(`\x1b[90m→ Exporting job ${jobId} as ${format.toUpperCase()}...\x1b[0m`);
    const data = await pith.exportJob(jobId, format);
    fs.writeFileSync(outputFile, data, 'utf-8');
    console.log(`\x1b[32m✔ Export saved to:\x1b[0m ${outputFile}`);
  } catch (err: any) {
    console.error(`\x1b[31mError:\x1b[0m ${err.message}`);
    process.exit(1);
  }
}

async function handleSite(subcommand: string, target: string, flags: Record<string, string>, extraArgs: string[]) {
  if (!subcommand || subcommand === 'help') {
    console.log(`
\x1b[32m[pith site]\x1b[0m Whole-Site Crawling & Template Extraction

Usage:
  pith site discover <url> [options]         Discover whole-site sitemaps, links, and page types
  pith site status <siteId>                  Show discovery / crawl status and live metrics
  pith site types <siteId>                   List detected page types, templates, and sample rows
  pith site extract <siteId>                 Run whole-site extraction across included page types
  pith site export <siteId> [options]        Download extracted dataset (.csv, .json, .xlsx, or .zip)

Options:
  --pages <num>                Max pages to discover/crawl (default: 100)
  --depth <num>                Max link depth (default: 3)
  --delay <seconds>            Crawl delay between requests (default: 0.2)
  --subdomains                 Include subdomains during discovery
  --method <http|playwright>   Select extraction engine
  --type <typeId>              Target a specific page type for export
  --format <csv|json|xlsx|zip> Export format (default: zip)
  --output, -o <file>          Save export directly to output file
`);
    return;
  }

  try {
    if (subcommand === 'discover') {
      if (!target) {
        console.error('\x1b[31mError:\x1b[0m URL is required. Usage: pith site discover <url>');
        process.exit(1);
      }
      console.log(`\x1b[90m→ Starting whole-site discovery for:\x1b[0m ${target}`);
      const res = await pith.discoverSite({
        url: target,
        max_pages: flags['--pages'] ? parseInt(flags['--pages'], 10) : 100,
        max_depth: flags['--depth'] ? parseInt(flags['--depth'], 10) : 3,
        crawl_delay: flags['--delay'] ? parseFloat(flags['--delay']) : 0.2,
        include_subdomains: flags['--subdomains'] === 'true',
        method: (flags['--method'] as any) || 'http',
      });
      console.log(`\x1b[32m✔ Discovery task launched!\x1b[0m`);
      console.log(`Site ID: \x1b[36m${res.site_id}\x1b[0m (domain: ${res.domain})`);
      console.log(`\nRun \x1b[1mpith site status ${res.site_id}\x1b[0m to check progress.`);
    } else if (subcommand === 'status') {
      if (!target) {
        console.error('\x1b[31mError:\x1b[0m Site ID is required. Usage: pith site status <siteId>');
        process.exit(1);
      }
      const site = await pith.getSite(target);
      console.log(`\n\x1b[1m--- Site Details [${site.domain}] ---\x1b[0m`);
      console.log(`ID:          \x1b[36m${site.id}\x1b[0m`);
      console.log(`Status:      \x1b[32m${site.status.toUpperCase()}\x1b[0m`);
      console.log(`Scrapability:${site.score}/100 [${site.level.toUpperCase()}]`);
      console.log(`Pages Found: ${site.page_count} discovered | ${site.extracted_count} extracted`);
      console.log(`Page Types:  ${site.page_types.length} templates detected`);

      if (site.crawl) {
        console.log(`\nCrawl State: ${site.crawl.status} | Speed: ${site.crawl.speed_pages_per_sec} p/s | ETA: ${site.crawl.estimated_time_remaining_sec}s`);
      }
      if (site.error_message) {
        console.log(`\x1b[31mNotice:      ${site.error_message}\x1b[0m`);
      }
    } else if (subcommand === 'types') {
      if (!target) {
        console.error('\x1b[31mError:\x1b[0m Site ID is required. Usage: pith site types <siteId>');
        process.exit(1);
      }
      const site = await pith.getSite(target);
      console.log(`\n\x1b[1mDetected Page Types for ${site.domain}:\x1b[0m\n`);
      site.page_types.forEach((pt, idx) => {
        const badge = pt.is_listing ? '[LISTING]' : '[DETAIL]';
        const inc = pt.is_included ? '\x1b[32m✔ INCLUDED\x1b[0m' : '\x1b[90m✕ EXCLUDED\x1b[0m';
        console.log(`[${idx + 1}] \x1b[1m${pt.name}\x1b[0m \x1b[36m${badge}\x1b[0m ${inc}`);
        console.log(`    Pattern:    ${pt.pattern}`);
        console.log(`    Pages:      ${pt.page_count} (${pt.extracted_count} extracted)`);
        console.log(`    Fields:     ${pt.fields.join(', ') || '(auto-detected headers/meta)'}`);
        if (pt.sample_rows && pt.sample_rows.length > 0) {
          console.log(`    Sample Row: ${JSON.stringify(pt.sample_rows[0]).slice(0, 100)}...`);
        }
        console.log('');
      });
    } else if (subcommand === 'extract') {
      if (!target) {
        console.error('\x1b[31mError:\x1b[0m Site ID is required. Usage: pith site extract <siteId>');
        process.exit(1);
      }
      console.log(`\x1b[90m→ Triggering full site extraction for site:\x1b[0m ${target}`);
      const res = await pith.extractSite(target);
      console.log(`\x1b[32m✔ Extraction started!\x1b[0m`);
      console.log(`Monitor progress via \x1b[1mpith site status ${target}\x1b[0m`);
    } else if (subcommand === 'export') {
      if (!target) {
        console.error('\x1b[31mError:\x1b[0m Site ID is required. Usage: pith site export <siteId>');
        process.exit(1);
      }
      const format = (flags['--format'] as any) || (flags['-f'] as any) || 'zip';
      const typeId = flags['--type'];
      const exportUrl = pith.getSiteExportUrl(target, { typeId, format });
      console.log(`\x1b[90m→ Export URL:\x1b[0m ${exportUrl}`);
      console.log(`\x1b[32m✔ Download export directly from the URL or web dashboard.\x1b[0m`);
    } else {
      console.error(`\x1b[31mUnknown site command:\x1b[0m ${subcommand}. Run 'pith site help'.`);
      process.exit(1);
    }
  } catch (err: any) {
    console.error(`\x1b[31mError:\x1b[0m ${err.message}`);
    process.exit(1);
  }
}

function parseFlags(args: string[]): { positionals: string[]; flags: Record<string, string> } {
  const positionals: string[] = [];
  const flags: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('-')) {
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        flags[arg] = next;
        i++;
      } else {
        flags[arg] = 'true';
      }
    } else {
      positionals.push(arg);
    }
  }

  return { positionals, flags };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printBanner();
    console.log(`
Usage:
  pith check <url> [options]          Evaluate URL scrapability & safety
  pith detect <url> [options]         Discover tables, cards, patterns & schema
  pith run <url|recipe_id> [options]  Run extraction job and display results
  pith export <job_id> [options]      Export extracted dataset to file
  pith site <subcommand> [options]    Site Mode: whole-site crawl, sitemaps & templates

Site Mode Subcommands:
  pith site discover <url>            Start whole-site page & template discovery
  pith site status <siteId>           Check crawl speed, ETA, and page stats
  pith site types <siteId>            List detected page types & sample data
  pith site extract <siteId>          Start extraction for all selected page types
  pith site export <siteId>           Download full site dataset (.zip, .csv, .json)

Options:
  -H, --header <key:val>       Pass custom request headers (e.g. -H "Authorization: Bearer <key>")
  --method <http|playwright>   Select extraction engine (default: http)
  --category <category_id>     Target specific detected category ID
  --pages <num>                Number of pages to follow / discover
  --depth <num>                Max crawl depth (Site Mode)
  --delay <sec>                Delay between requests in seconds
  --output, -o <file>          Save output to file (.json or .csv)
  --format, -f <csv|json|xlsx|zip> Output format for export
`);
    process.exit(0);
  }

  const command = args[0];
  const { positionals, flags } = parseFlags(args.slice(1));
  const target = positionals[0];

  switch (command) {
    case 'check':
      await handleCheck(target, flags);
      break;
    case 'detect':
      await handleDetect(target, flags);
      break;
    case 'run':
      await handleRun(target, flags);
      break;
    case 'export':
      await handleExport(target, flags);
      break;
    case 'site':
      await handleSite(positionals[0], positionals[1], flags, positionals.slice(2));
      break;
    default:
      console.error(`\x1b[31mUnknown command:\x1b[0m ${command}. Run 'pith --help' for usage.`);
      process.exit(1);
  }
}

main();

