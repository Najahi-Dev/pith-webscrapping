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

Options:
  -H, --header <key:val>       Pass custom request headers (e.g. -H "Authorization: Bearer <key>")
  --method <http|playwright>   Select extraction engine (default: http)
  --category <category_id>     Target specific detected category ID
  --pages <num>                Number of pages to follow (default: 1)
  --output, -o <file>          Save output to file (.json or .csv)
  --format, -f <csv|json|xlsx> Output format for export (default: json)
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
    default:
      console.error(`\x1b[31mUnknown command:\x1b[0m ${command}. Run 'pith --help' for usage.`);
      process.exit(1);
  }
}

main();
