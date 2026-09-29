import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  apiSpider,
  contentMetadata,
  type ApiContent,
  type ApiCrawler,
  type ApiEmbedded,
  type ApiEmbeddedCollection
} from '../src/collection.patternFlyApi';
import { getSessionOptions, getOptions, runWithOptions } from '../src/options.context';
import { createLogger } from '../src/logger';
import { type LoggingSession } from '../src/options.defaults';

/**
 * Reason classification for omitted or removed API records.
 */
type RemovalReason =
  'lacks quality' |
  'empty response' |
  'loading error' |
  'deferred category' |
  'upstream removed';

/**
 * Entry describing a removed record with its determined reason and details.
 */
interface RemovedRecordReport {
  record: ApiEmbedded;
  reason: RemovalReason;
  details?: string;
}

/**
 * Entry describing a modified record and the changed fields.
 */
interface ModifiedRecordReport {
  record: ApiEmbedded;
  reasons: string[];
}

/**
 * Create a diff report with annotated reasons between old and new collections.
 *
 * @param oldRecords - Previous collection
 * @param newRecords - Updated collection
 * @param crawledMap - Map of all crawled entries and evaluated metadata
 */
const diffCollections = (
  oldRecords: ApiEmbedded[],
  newRecords: ApiEmbedded[],
  crawledMap: Map<string, { entry: ApiCrawler; metadata: ApiContent }>
) => {
  const oldMap = new Map(oldRecords.map(record => [record.p, record]));
  const newMap = new Map(newRecords.map(record => [record.p, record]));

  const added = newRecords.filter(record => !oldMap.has(record.p));

  const removed: RemovedRecordReport[] = [];

  for (const oldRecord of oldRecords) {
    if (newMap.has(oldRecord.p)) {
      continue;
    }

    const crawled = crawledMap.get(oldRecord.p);

    if (!crawled) {
      removed.push({
        record: oldRecord,
        reason: 'upstream removed',
        details: 'Endpoint no longer referenced upstream'
      });
    } else if (!crawled.entry.content || crawled.entry.content.trim() === '' || crawled.entry.content === '{}' || crawled.entry.content === '[]') {
      removed.push({
        record: oldRecord,
        reason: 'empty response',
        details: 'Empty payload returned'
      });
    } else if (crawled.metadata.isDeferred) {
      removed.push({
        record: oldRecord,
        reason: 'deferred category',
        details: `Category '${crawled.metadata.category}' is deferred`
      });
    } else if (crawled.metadata.isLowQuality || crawled.entry.qualityScore < 0.95) {
      removed.push({
        record: oldRecord,
        reason: 'lacks quality',
        details: `Evaluated Q: ${crawled.entry.qualityScore} < 0.95 threshold`
      });
    } else {
      removed.push({
        record: oldRecord,
        reason: 'lacks quality',
        details: `Evaluated Q: ${crawled.entry.qualityScore}`
      });
    }
  }

  const modified: ModifiedRecordReport[] = [];

  for (const record of newRecords) {
    const prev = oldMap.get(record.p);

    if (!prev) {
      continue;
    }

    const reasons: string[] = [];

    if (prev.q !== record.q) {
      reasons.push(`quality score (${prev.q} -> ${record.q})`);
    }

    if (prev.n !== record.n) {
      reasons.push(`name ("${prev.n}" -> "${record.n}")`);
    }

    if (prev.d !== record.d) {
      reasons.push('description updated');
    }

    if (prev.c !== record.c) {
      reasons.push(`content-type (${prev.c} -> ${record.c})`);
    }

    if (reasons.length > 0) {
      modified.push({ record, reasons });
    }
  }

  return { added, removed, modified };
};

/**
 * Create a light diff report between old and new collections.
 *
 * @param diff - Diff report
 */
const diffReport = (diff: ReturnType<typeof diffCollections>) => {
  const { added, removed, modified } = diff;
  const hasChanges = added.length > 0 || removed.length > 0 || modified.length > 0;

  console.log('\n📊 Collection Diff Report:');

  if (!hasChanges) {
    console.log('   ✨ No record additions, removals, or property modifications detected.');

    return;
  }

  if (added.length > 0) {
    console.log(`   ➕ Added (${added.length}):`);
    added.slice(0, 10).forEach(record => console.log(`      + ${record.p} (Q: ${record.q})`));

    if (added.length > 10) {
      console.log(`      ... and ${added.length - 10} more`);
    }
  }

  if (removed.length > 0) {
    console.log(`   ➖ Removed (${removed.length}):`);
    removed.slice(0, 15).forEach(({ record, reason, details }) => {
      console.log(`      - ${record.p} (Previous Q: ${record.q}) [Reason: ${reason}${details ? ` — ${details}` : ''}]`);
    });

    if (removed.length > 15) {
      console.log(`      ... and ${removed.length - 15} more`);
    }
  }

  if (modified.length > 0) {
    console.log(`   🔄 Modified (${modified.length}):`);
    modified.slice(0, 10).forEach(({ record, reasons }) => {
      console.log(`      ~ ${record.p} [${reasons.join(', ')}]`);
    });

    if (modified.length > 10) {
      console.log(`      ... and ${modified.length - 10} more`);
    }
  }
};

/**
 * Run apiSpider directly and transform crawler entries into compressed embedded JSON.
 *
 * @param [options] - Optional configuration options.
 * @param [options.isPrettyPrint=true] - Whether to pretty-print the JSON output.
 * @param [options.filterLowQualityRecords=false] - Whether to filter low-quality records based on the collection's criteria.
 */
const run = async (
  {
    isPrettyPrint = true,
    filterLowQualityRecords = false
  }: { isPrettyPrint?: boolean; filterLowQualityRecords?: boolean; } = {}
) => {
  // 1. Enable stderr logging so all diagnostics_channel logs (debug, info, warn, error) are printed
  const unsubscribeLogger = createLogger({
    channelName: getSessionOptions().channelName,
    stderr: true,
    level: 'debug'
  } as LoggingSession);

  console.log('🚀 Generating PatternFly API embedded collection...');
  const keepAlive = setTimeout(() => {}, 86_400_000);

  const startTime = Date.now();
  const options = getOptions();
  const { base } = options.patternflyOptions.api;

  try {
    const entries: ApiCrawler[] = await runWithOptions(options, async () => apiSpider(options));

    if (!entries.length) {
      console.error('❌ Crawl failed or returned 0 entries. Aborting update.');
      process.exit(1);
    }

    const recordsMap = new Map<string, ApiEmbedded>();
    const crawledMap = new Map<string, { entry: ApiCrawler; metadata: ApiContent }>();

    for (const entry of entries) {
      // Generate full metadata using the shared contentMetadata function
      const metadata = contentMetadata(entry, options);
      const relativePath = metadata.path.replace(base, '').replace(/^\//, '');

      crawledMap.set(relativePath, { entry, metadata });

      if (filterLowQualityRecords && (metadata.isDeferred || metadata.isLowQuality)) {
        continue;
      }

      if (recordsMap.has(relativePath)) {
        continue;
      }

      recordsMap.set(relativePath, {
        p: relativePath,
        n: metadata.displayName,
        d: metadata.description,
        c: metadata.contentType,
        q: entry.qualityScore
      });
    }

    const records = [...recordsMap.values()].sort((a, b) => a.p.localeCompare(b.p));

    const payload: ApiEmbeddedCollection = {
      version: '1',
      generated: new Date().toISOString(),
      base,
      records
    };

    const outputPath = resolve(fileURLToPath(new URL('../src/collection.patternFlyApi.json', import.meta.url)));
    const jsonContent = isPrettyPrint ? JSON.stringify(payload, null, 2) : JSON.stringify(payload);
    let oldRecords: ApiEmbedded[] = [];

    try {
      const existingContent = await readFile(outputPath, 'utf-8');
      const parsedExisting: ApiEmbeddedCollection = JSON.parse(existingContent);

      oldRecords = parsedExisting.records || [];
    } catch {
      // File might not exist yet on initial run
    }

    await writeFile(outputPath, jsonContent + '\n', 'utf-8');

    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
    const sizeKb = (Buffer.byteLength(jsonContent, 'utf-8') / 1024).toFixed(1);

    console.log(`✅ Updated src/collection.patternFlyApi.json:`);
    console.log(`   - Total Crawled: ${entries.length} endpoints`);
    console.log(`   - Admitted Records: ${records.length}`);
    console.log(`   - File Size: ${sizeKb} KB`);
    console.log(`   - Time Elapsed: ${durationSec}s`);

    diffReport(diffCollections(oldRecords, records, crawledMap));
  } finally {
    clearTimeout(keepAlive);
    unsubscribeLogger();
  }
};

/**
 * Configurable options for maintainers.
 */
run({ isPrettyPrint: true, filterLowQualityRecords: true }).catch(error => {
  console.error('❌ Failed to update API collection:', error);
  process.exit(1);
});

export {
  type ModifiedRecordReport,
  type RemovalReason,
  type RemovedRecordReport
};
