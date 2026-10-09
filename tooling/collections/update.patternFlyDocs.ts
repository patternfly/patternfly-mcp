import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { type PatternFlyMcpDocsCatalog } from '../../src/docs.embedded';
import {
  getDefaultReportPath,
  saveCsvReport
} from './csv';
import {
  extractTrackedReposFromCatalog,
  fetchLatestRepoHashes,
  getSrcPath,
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
  docsFilename?: string | undefined;
  apiFilename?: string | undefined;
  reportFilename?: string | undefined;
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
 * Configurable default filename for the documentation collection.
 */
const DEFAULT_DOCS_FILENAME = 'docs.json';

/**
 * Configurable default filename for the API collection.
 */
const DEFAULT_API_FILENAME = 'collection.patternFlyApi.json';

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
 * @param [options] - Optional execution options.
 * @param [options.docsFilename=DEFAULT_DOCS_FILENAME] - Target documentation filename.
 * @param [options.apiFilename=DEFAULT_API_FILENAME] - Target API filename for deduplication.
 * @param [options.reportFilename=DEFAULT_DOCS_REPORT_FILENAME] - Target CSV report filename.
 * @param [options.docsPath] - Fully resolved path to write the documentation collection.
 * @param [options.apiPath] - Fully resolved path to read the API collection.
 * @param [options.csvOutputPath] - Fully resolved path to write the CSV report.
 * @param [options.pruneApiOverlap=true] - Whether to prune duplicate docs that exist in API collection.
 * @param [options.verifyReachability=false] - Whether to probe URLs for reachability.
 * @param [options.updateHashes=true] - Whether to sync repository commit SHAs.
 * @param [options.isPrettyPrint=true] - Whether to pretty-print the JSON output.
 * @param [options.outputCsv=true] - Whether to generate and save CSV report.
 * @returns Promise resolving to the diff result
 */
const run = async ({
  docsFilename = DEFAULT_DOCS_FILENAME,
  apiFilename = DEFAULT_API_FILENAME,
  reportFilename = DEFAULT_DOCS_REPORT_FILENAME,
  docsPath = getSrcPath(docsFilename),
  apiPath = getSrcPath(apiFilename),
  csvOutputPath = getDefaultReportPath(reportFilename),
  pruneApiOverlap = true,
  verifyReachability = false,
  updateHashes = true,
  isPrettyPrint = true,
  outputCsv = true
}: UpdateDocsOptions = {}): Promise<DocsDiffResult> => {
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
    verifyReachability
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
  DEFAULT_API_FILENAME,
  DEFAULT_DOCS_FILENAME,
  DEFAULT_DOCS_REPORT_FILENAME,
  logDiffReport,
  run,
  type UpdateDocsOptions
};
