import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  apiSpider,
  contentMetadata,
  type ApiCrawler,
  type ApiEmbedded,
  type ApiEmbeddedCollection
} from '../src/collection.patternFlyApi';
import { getOptions, runWithOptions } from '../src/options.context';

/**
 * Create a light diff report between old and new collections.
 *
 * @param oldRecords - Previous collection
 * @param newRecords - Updated collection
 */
const diffCollections = (oldRecords: ApiEmbedded[], newRecords: ApiEmbedded[]) => {
  const oldMap = new Map(oldRecords.map(record => [record.p, record]));
  const newMap = new Map(newRecords.map(record => [record.p, record]));

  const added = newRecords.filter(record => !oldMap.has(record.p));
  const removed = oldRecords.filter(record => !newMap.has(record.p));
  const modified = newRecords.filter(record => {
    const prev = oldMap.get(record.p);

    return prev && (prev.q !== record.q || prev.n !== record.n || prev.d !== record.d || prev.c !== record.c);
  });

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
    removed.slice(0, 10).forEach(record => console.log(`      - ${record.p}`));

    if (removed.length > 10) {
      console.log(`      ... and ${removed.length - 10} more`);
    }
  }

  if (modified.length > 0) {
    console.log(`   🔄 Modified (${modified.length}):`);
    modified.slice(0, 10).forEach(record => console.log(`      ~ ${record.p} (Q: ${record.q})`));

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

    for (const entry of entries) {
      // Generate full metadata using the shared contentMetadata function
      const metadata = contentMetadata(entry, options);

      if (filterLowQualityRecords && (metadata.isDeferred || metadata.isLowQuality)) {
        continue;
      }

      const relativePath = metadata.path.replace(base, '').replace(/^\//, '');

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

    diffReport(diffCollections(oldRecords, records));
  } finally {
    clearTimeout(keepAlive);
  }
};

/**
 * Configurable options for maintainers.
 */
run({ isPrettyPrint: true, filterLowQualityRecords: true }).catch(error => {
  console.error('❌ Failed to update API collection:', error);
  process.exit(1);
});
