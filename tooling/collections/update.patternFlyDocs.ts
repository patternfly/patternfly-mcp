import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type PatternFlyMcpDocsCatalog } from '../../src/docs.embedded';
import {
  getDefaultReportPath,
  saveCsvReport
} from './csv';
import {
  extractTrackedReposFromCatalog,
  fetchLatestRepoHashes,
  runUpdateTask,
  writeJsonCollection
} from './helpers';
import { printDiffSummary } from './summary';
import {
  diffDocsManifests,
  findApiRedundantDocs,
  generateReportCsv,
  recalculateManifestMetadata,
  type ApiCollectionRecordRef,
  type DocsDiffResult
} from './update.patternFlyDocsHelpers';

/**
 * Options for running the documentation manifest collection update.
 */
interface UpdateDocsOptions {
  docsPath?: string | undefined;
  apiPath?: string | undefined;
  csvOutputPath?: string | undefined;
  pruneApiOverlap?: boolean | undefined;
  verifyReachability?: boolean | undefined;
  updateHashes?: boolean | undefined;
  isPrettyPrint?: boolean | undefined;
  outputCsv?: boolean | undefined;
}

/**
 * Configurable default filename for the documentation report.
 */
const DEFAULT_DOCS_REPORT_FILENAME = 'collection.patternFlyDocs.report.csv';

/**
 * Log a structured diff summary of the documentation changes to the console.
 *
 * @param diff - Complete diff result
 */
const logDiffReport = (diff: DocsDiffResult) => {
  printDiffSummary(diff, {
    title: 'PatternFly Docs Collection Diff Report',
    formatAdded: item => `[${item.category}] ${item.record.displayName} (${item.record.pathSlug})`,
    formatRemoved: item => `[${item.category}] ${item.record.displayName} (${item.record.pathSlug}) [Reason: ${item.reason}${item.details ? ` — ${item.details}` : ''}]`,
    formatModified: item => `[${item.category}] ${item.record.displayName} [${item.reasons.join(', ')}]`
  });
};

/**
 * Update the PatternFly Docs manifest collection, deduplicating against the API seed and syncing repository SHAs.
 *
 * @param [options={}] - Execution options
 * @returns Promise resolving to the diff result
 */
const run = async (options: UpdateDocsOptions = {}): Promise<DocsDiffResult> => {
  const docsPath =
    options.docsPath ||
    process.env.DOCS_COLLECTION_PATH ||
    resolve(fileURLToPath(new URL('../../src/docs.json', import.meta.url)));

  const apiPath =
    options.apiPath ||
    process.env.API_COLLECTION_PATH ||
    resolve(fileURLToPath(new URL('../../src/collection.patternFlyApi.json', import.meta.url)));

  const csvOutputPath =
    options.csvOutputPath ||
    process.env.CSV_DOCS_REPORT_PATH ||
    getDefaultReportPath(DEFAULT_DOCS_REPORT_FILENAME);

  const pruneApiOverlap = options.pruneApiOverlap !== false;
  const updateHashes = options.updateHashes !== false;
  const isPrettyPrint = options.isPrettyPrint !== false;
  const outputCsv = options.outputCsv !== false;

  console.log('🚀 Updating PatternFly Docs manifest collection...');
  const startTime = Date.now();

  // 1. Read existing documentation catalog
  const rawDocs = await readFile(docsPath, 'utf-8');
  const oldCatalog: PatternFlyMcpDocsCatalog = JSON.parse(rawDocs);

  // 2. Read API collection for deduplication if enabled and present
  let apiRecords: ApiCollectionRecordRef[] = [];

  if (pruneApiOverlap && existsSync(apiPath)) {
    try {
      const rawApi = await readFile(apiPath, 'utf-8');
      const apiCatalog = JSON.parse(rawApi);

      apiRecords = apiCatalog.records || [];
    } catch {
      console.warn(`⚠️ Could not parse API collection at ${apiPath}. Skipping API deduplication.`);
    }
  }

  // 3. Identify redundant records superseded by API collection
  const redundantRecords = pruneApiOverlap ? findApiRedundantDocs(oldCatalog, apiRecords) : [];

  // 4. Fetch latest commit SHAs for tracked upstream repositories if enabled
  let latestHashes = new Map<string, string>();

  if (updateHashes) {
    const trackedRepos = extractTrackedReposFromCatalog(oldCatalog);

    latestHashes = await fetchLatestRepoHashes(trackedRepos);
  }

  // 5. Build updated catalog and recalculate manifest metadata
  const updatedCatalog = recalculateManifestMetadata(oldCatalog, {
    redundantRecords,
    latestHashes: updateHashes ? latestHashes : undefined,
    verifyReachability: options.verifyReachability
  });

  // 6. Write updated documentation manifest
  await writeJsonCollection(docsPath, updatedCatalog, {
    isPrettyPrint,
    startTime,
    stats: [
      { label: 'Total Categories', value: updatedCatalog.meta.totalEntries },
      { label: 'Total Documents', value: updatedCatalog.meta.totalDocs }
    ]
  });

  // 7. Calculate diff and print console summary
  const diff = diffDocsManifests(oldCatalog, updatedCatalog, redundantRecords);

  logDiffReport(diff);

  // 8. Generate and save CSV report if requested
  if (outputCsv) {
    const csvContent = generateReportCsv({ diff });

    await saveCsvReport(csvOutputPath, csvContent);
  }

  return diff;
};

/**
 * Direct execution when invoked via UPDATE_COLLECTIONS=true
 */
runUpdateTask('Docs collection', run);

export {
  DEFAULT_DOCS_REPORT_FILENAME,
  logDiffReport,
  run,
  type UpdateDocsOptions
};
