import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  apiSpider,
  contentMetadata,
  type ApiContent,
  type ApiCrawler,
  type ApiEmbedded,
  type ApiEmbeddedCollection,
  MIN_API_QUALITY_THRESHOLD
} from '../../src/collection.patternFlyApi';
import { getLoggerOptions, getOptions, runWithOptions } from '../../src/options.context';
import { createLogger } from '../../src/logger';
import {
  generateDiffCsv,
  getDefaultReportPath,
  saveCsvReport
} from './csv';
import { runUpdateTask, writeJsonCollection } from './helpers';
import { printDiffSummary } from './summary';

/**
 * Reason classification for omitted or removed API records.
 */
type RemovalReason =
  'lacks quality' |
  'empty response' |
  'deferred category' |
  'upstream removed' |
  'other';

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
 * Options for generating CSV report output.
 */
interface GenerateCsvReportOptions {
  diff: ReturnType<typeof diffCollections>;
  oldRecords: ApiEmbedded[];
  newRecords: ApiEmbedded[];
  crawledMap: Map<string, { entry: ApiCrawler; metadata: ApiContent }>;
}

/**
 * Configurable default filename for the API report.
 */
const DEFAULT_API_REPORT_FILENAME = 'collection.patternFlyApi.report.csv';

/**
 * Generate a complete, non-truncated CSV report for additions, removals, modifications, and unchanged records.
 *
 * @param options - Generation options
 * @param options.diff - Diff calculation between old and new records
 * @param options.oldRecords - Previous collection records
 * @param options.newRecords - Current collection records
 * @param options.crawledMap - Map of crawled entries and metadata
 */
const generateReportCsv = ({
  diff,
  oldRecords,
  newRecords,
  crawledMap
}: GenerateCsvReportOptions): string => {
  const oldMap = new Map(oldRecords.map(record => [record.p, record]));
  const changedPaths = new Set([
    ...diff.added.map(record => record.p),
    ...diff.removed.map(removedItem => removedItem.record.p),
    ...diff.modified.map(modifiedItem => modifiedItem.record.p)
  ]);
  const unchanged = newRecords.filter(record => !changedPaths.has(record.p));

  return generateDiffCsv(
    { ...diff, unchanged },
    {
      headers: ['status', 'path', 'name', 'previousQualityScore', 'newQualityScore', 'contentType', 'reason', 'details'],
      added: record => [record.p, record.n, '', record.q, record.c, '', ''],
      removed: ({ record, reason, details }) => [
        record.p,
        record.n,
        record.q,
        crawledMap.get(record.p)?.entry.qualityScore ?? '',
        record.c,
        reason,
        details || ''
      ],
      modified: ({ record, reasons }) => [
        record.p,
        record.n,
        oldMap.get(record.p)?.q ?? '',
        record.q,
        record.c,
        'property changes',
        reasons.join('; ')
      ],
      unchanged: record => [record.p, record.n, record.q, record.q, record.c, '', '']
    }
  );
};

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
    } else if (crawled.metadata.isLowQuality || crawled.entry.qualityScore < MIN_API_QUALITY_THRESHOLD) {
      removed.push({
        record: oldRecord,
        reason: 'lacks quality',
        details: `Evaluated Q: ${crawled.entry.qualityScore} < ${MIN_API_QUALITY_THRESHOLD} threshold`
      });
    } else {
      removed.push({
        record: oldRecord,
        reason: 'other',
        details: `Excluded during crawl processing (Q: ${crawled.entry.qualityScore})`
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
 * Create a diff report with annotated reasons between old and new collections.
 *
 * @param diff - Complete diff result
 */
const diffReport = (diff: ReturnType<typeof diffCollections>) => {
  printDiffSummary(diff, {
    title: 'PatternFly API Collection Diff Report',
    formatAdded: record => `${record.p} (${record.n})`,
    formatRemoved: ({ record, reason, details }) => `${record.p} (${record.n}) [Reason: ${reason}${details ? ` — ${details}` : ''}]`,
    formatModified: ({ record, reasons }) => `${record.p} [${reasons.join(', ')}]`
  });
};

/**
 * Run apiSpider directly and transform crawler entries into compressed embedded JSON.
 *
 * @param [options] - Optional configuration options.
 * @param [options.isPrettyPrint=true] - Whether to pretty-print the JSON output.
 * @param [options.filterLowQualityRecords=false] - Whether to filter low-quality records based on the collection's criteria.
 * @param [options.outputCsv=true] - Whether to generate and save a full CSV diff report.
 * @param [options.csvOutputPath] - Custom path to write CSV report.
 */
const run = async (
  {
    isPrettyPrint = true,
    filterLowQualityRecords = false,
    outputCsv = true,
    csvOutputPath
  }: { isPrettyPrint?: boolean; filterLowQualityRecords?: boolean; outputCsv?: boolean; csvOutputPath?: string; } = {}
) => {
  // 1. Enable stderr logging so all diagnostics_channel logs (debug, info, warn, error) are printed
  const unsubscribeLogger = createLogger({
    ...getLoggerOptions(),
    stderr: true,
    level: 'debug'
  });

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

    const outputPath = resolve(fileURLToPath(new URL('../../src/collection.patternFlyApi.json', import.meta.url)));
    let oldRecords: ApiEmbedded[] = [];

    try {
      const existingContent = await readFile(outputPath, 'utf-8');
      const parsedExisting: ApiEmbeddedCollection = JSON.parse(existingContent);

      oldRecords = parsedExisting.records || [];
    } catch {
      // File might not exist yet on initial run
    }

    await writeJsonCollection(outputPath, payload, {
      isPrettyPrint,
      startTime,
      stats: [
        { label: 'Total Crawled', value: `${entries.length} endpoints` },
        { label: 'Admitted Records', value: records.length }
      ]
    });

    const diff = diffCollections(oldRecords, records, crawledMap);

    diffReport(diff);

    if (outputCsv) {
      const targetCsvPath =
        csvOutputPath ||
        process.env.CSV_REPORT_PATH ||
        getDefaultReportPath(DEFAULT_API_REPORT_FILENAME);

      const csvContent = generateReportCsv({ diff, oldRecords, newRecords: records, crawledMap });

      await saveCsvReport(targetCsvPath, csvContent);
    }
  } finally {
    clearTimeout(keepAlive);
    unsubscribeLogger();
  }
};

/**
 * Direct execution when invoked via UPDATE_COLLECTIONS=true
 */
runUpdateTask('API collection', run);

export {
  DEFAULT_API_REPORT_FILENAME,
  diffCollections,
  diffReport,
  generateReportCsv,
  run,
  type GenerateCsvReportOptions,
  type ModifiedRecordReport,
  type RemovalReason,
  type RemovedRecordReport
};
