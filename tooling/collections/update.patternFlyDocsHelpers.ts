import {
  type PatternFlyMcpDocsCatalog,
  type PatternFlyMcpDocsCatalogDoc,
  type PatternFlyMcpDocsCatalogEntry
} from '../../src/docs.embedded';
import { extractCommitHash, extractRepoInfo } from './helpers';
import { generateDiffCsv } from './csv';

/**
 * Report entry for an added document in the manifest.
 */
interface DocsAddedRecordReport {
  category: string;
  record: PatternFlyMcpDocsCatalogDoc;
  reason?: string | undefined;
  details?: string | undefined;
}

/**
 * Report entry for a removed document in the manifest.
 */
interface DocsRemovedRecordReport {
  category: string;
  record: PatternFlyMcpDocsCatalogDoc;
  reason: string;
  details?: string | undefined;
}

/**
 * Report entry for a modified document in the manifest.
 */
interface DocsModifiedRecordReport {
  category: string;
  record: PatternFlyMcpDocsCatalogDoc;
  previousRecord?: PatternFlyMcpDocsCatalogDoc | undefined;
  reasons: string[];
  previousHash?: string | undefined;
  newHash?: string | undefined;
}

/**
 * Report entry for an unchanged document in the manifest.
 */
interface DocsUnchangedRecordReport {
  category: string;
  record: PatternFlyMcpDocsCatalogDoc;
}

/**
 * Complete diff result between two documentation manifests.
 */
interface DocsDiffResult {
  added: DocsAddedRecordReport[];
  removed: DocsRemovedRecordReport[];
  modified: DocsModifiedRecordReport[];
  unchanged: DocsUnchangedRecordReport[];
}

/**
 * Options for generating Docs collection CSV diff report.
 */
interface GenerateCsvReportOptions {
  diff: DocsDiffResult;
}

/**
 * Minimal shape of an API embedded collection record for cross-referencing.
 */
interface ApiCollectionRecordRef {
  p: string;
  n?: string | undefined;
  q?: number | undefined;
}

/**
 * Options for recalculating manifest metadata and transforming entries.
 */
interface RecalculateOptions {
  redundantRecords?: DocsRemovedRecordReport[] | undefined;
  latestHashes?: Map<string, string> | undefined;
  verifyReachability?: boolean | undefined;
}

/**
 * Concise mapping of non-standard slugs to their corresponding API endpoint paths.
 */
const AI_GUIDELINE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  'development-rules': 'overview',
  guidelines: 'overview',
  'table-rules': 'table',
  'layout-components': 'layout',
  troubleshooting: 'common-issues'
});

/**
 * Pinned historical commit SHAs preserved for legacy or static references.
 */
const PINNED_HISTORICAL_REFS = new Set<string>([
  'ec02b437ec72b6e4cc4e28524516288f4acf9fdf', // Legacy design guidelines
  'ce032cd16ddb90c540cb4f18c6830e190cd9e3e9', // Tooling reference
  '402b3b0e7ed73cb2aa21531e0eab4216c2211212', // Elements reference
  'e8cca17430a8ccb062ed1878073165417a081b34' // AIHelpers pinned baseline
]);

/**
 * Resolve the matching API endpoint for an upstream AI helper document.
 *
 * @param doc - Document record to evaluate
 * @param highQualityApi - List of API collection records meeting the quality threshold
 * @returns Matched API endpoint path or undefined if not superseded
 */
const resolveApiEndpointForAiDoc = (
  doc: PatternFlyMcpDocsCatalogDoc,
  highQualityApi: ApiCollectionRecordRef[]
): string | undefined => {
  const slug = doc.pathSlug || '';

  // 1. Root ai-helpers links superseded by the marketplace endpoint
  if (/^ai-helpers-(readme|contributing|contributing-skills)$/.test(slug)) {
    return 'v6/AI/ai-assisted-development_marketplace/text';
  }

  // 2. Component and development guidelines in ai-helpers
  if (doc.path && doc.path.includes('/docs/')) {
    const targetSlug = AI_GUIDELINE_ALIASES[slug] || slug;
    const candidate = `v6/AI/development-guidelines_${targetSlug}/text`;
    const exactMatch = highQualityApi.find(apiRecord => apiRecord.p === candidate);

    if (exactMatch) {
      return exactMatch.p;
    }

    // Dynamic token fallback against indexed API endpoints
    const token = targetSlug.toLowerCase().replace(/[^a-z0-9]/g, '');
    const fuzzyMatch = highQualityApi.find(
      apiRecord =>
        apiRecord.p.startsWith('v6/AI/development-guidelines') &&
        apiRecord.p.toLowerCase().replace(/[^a-z0-9]/g, '').includes(token)
    );

    return fuzzyMatch ? fuzzyMatch.p : candidate;
  }

  return undefined;
};

/**
 * Identify documentation entries in `docs.json` that are redundant with and superseded by the PatternFly API collection.
 *
 * @param docsCatalog - The documentation catalog to inspect
 * @param [apiRecords=[]] - Records from the API collection seed
 * @returns List of redundant records with removal reasons and matched API details
 */
const findApiRedundantDocs = (
  docsCatalog: PatternFlyMcpDocsCatalog,
  apiRecords: ApiCollectionRecordRef[] = []
): DocsRemovedRecordReport[] => {
  const redundant: DocsRemovedRecordReport[] = [];
  const highQualityApi = (apiRecords || []).filter(apiRecord => (apiRecord.q ?? 1) >= 0.95);

  for (const [category, entries] of Object.entries(docsCatalog.docs || {})) {
    for (const doc of entries) {
      // 1. Root uxd-ai-helpers guides must NEVER be pruned (negative control boundary)
      if (doc.pathSlug && doc.pathSlug.startsWith('uxd-ai-helpers-')) {
        continue;
      }

      // 2. Ecosystem / tooling repos must NEVER be pruned
      if (
        doc.path &&
        (doc.path.includes('/patternfly-cli/') ||
          doc.path.includes('/patternfly-elements/') ||
          doc.path.includes('/patternfly-mcp/') ||
          doc.path.includes('/pf-codemods/'))
      ) {
        continue;
      }

      const isAiHelperRepo =
        doc.path &&
        (doc.path.includes('/ai-helpers/') || doc.path.includes('/uxd-ai-helpers/'));

      if (isAiHelperRepo) {
        const details = resolveApiEndpointForAiDoc(doc, highQualityApi);

        if (details) {
          redundant.push({
            category,
            record: doc,
            reason: 'superseded by API collection',
            details
          });
        }
      }
    }
  }

  return redundant;
};

/**
 * Calculate the diff between an old documentation catalog and an updated catalog.
 *
 * @param oldCatalog - Original catalog
 * @param newCatalog - Updated catalog
 * @param [redundantReports=[]] - Explicitly identified removals
 * @returns Structured DocsDiffResult
 */
const diffDocsManifests = (
  oldCatalog: PatternFlyMcpDocsCatalog,
  newCatalog: PatternFlyMcpDocsCatalog,
  redundantReports: DocsRemovedRecordReport[] = []
): DocsDiffResult => {
  const added: DocsAddedRecordReport[] = [];
  const removed: DocsRemovedRecordReport[] = [...redundantReports];
  const modified: DocsModifiedRecordReport[] = [];
  const unchanged: DocsUnchangedRecordReport[] = [];

  const oldRecordsMap = new Map<string, { category: string; doc: PatternFlyMcpDocsCatalogDoc }>();

  for (const [cat, docs] of Object.entries(oldCatalog.docs || {})) {
    for (const doc of docs) {
      oldRecordsMap.set(`${cat}::${doc.pathSlug}::${doc.displayName}`, { category: cat, doc });
    }
  }

  const newRecordsMap = new Map<string, { category: string; doc: PatternFlyMcpDocsCatalogDoc }>();

  for (const [cat, docs] of Object.entries(newCatalog.docs || {})) {
    for (const doc of docs) {
      newRecordsMap.set(`${cat}::${doc.pathSlug}::${doc.displayName}`, { category: cat, doc });
    }
  }

  const removedKeys = new Set(
    redundantReports.map(
      report => `${report.category}::${report.record.pathSlug}::${report.record.displayName}`
    )
  );

  // Check for any additional old records missing in new catalog
  for (const [key, { category, doc }] of oldRecordsMap.entries()) {
    if (!newRecordsMap.has(key) && !removedKeys.has(key)) {
      removed.push({
        category,
        record: doc,
        reason: 'removed from manifest',
        details: 'Record excluded during manifest update'
      });
      removedKeys.add(key);
    }
  }

  // Check for added, modified, or unchanged in new catalog
  for (const [key, { category, doc }] of newRecordsMap.entries()) {
    const oldEntry = oldRecordsMap.get(key);

    if (!oldEntry) {
      added.push({
        category,
        record: doc,
        reason: 'new upstream document',
        details: 'Discovered in manifest update'
      });
      continue;
    }

    const reasons: string[] = [];
    const previousDoc = oldEntry.doc;
    const oldHash = extractCommitHash(previousDoc.path || '');
    const newHash = extractCommitHash(doc.path || '');

    if (previousDoc.path !== doc.path) {
      if (oldHash !== newHash && oldHash && newHash) {
        const shortOld = oldHash.slice(0, 7);
        const shortNew = newHash.slice(0, 7);

        reasons.push(`hash update (${shortOld} -> ${shortNew})`);
      } else {
        reasons.push('path updated');
      }
    }

    if (previousDoc.version !== doc.version) {
      reasons.push(`version changed (${previousDoc.version} -> ${doc.version})`);
    }

    if (reasons.length > 0) {
      modified.push({
        category,
        record: doc,
        previousRecord: previousDoc,
        reasons,
        previousHash: oldHash || undefined,
        newHash: newHash || undefined
      });
    } else {
      unchanged.push({
        category,
        record: doc
      });
    }
  }

  return { added, removed, modified, unchanged };
};

/**
 * Generate a complete RFC 4180 CSV report for the documentation manifest diff.
 *
 * @param options - CSV report options or diff result
 * @returns Formatted CSV content string
 */
const generateReportCsv = (options: DocsDiffResult | GenerateCsvReportOptions): string => {
  const diff = 'diff' in options ? options.diff : options;

  return generateDiffCsv(diff, {
    headers: [
      'status',
      'category',
      'name',
      'pathSlug',
      'path',
      'previousHash',
      'newHash',
      'reason',
      'details'
    ],
    added: item => [
      item.category,
      item.record.displayName,
      item.record.pathSlug,
      item.record.path,
      '',
      extractCommitHash(item.record.path) || '',
      item.reason || 'new document',
      item.details || ''
    ],
    removed: item => [
      item.category,
      item.record.displayName,
      item.record.pathSlug,
      item.record.path,
      extractCommitHash(item.record.path) || '',
      '',
      item.reason,
      item.details || ''
    ],
    modified: item => [
      item.category,
      item.record.displayName,
      item.record.pathSlug,
      item.record.path,
      item.previousHash || '',
      item.newHash || '',
      item.reasons.join('; '),
      item.previousRecord?.path || ''
    ],
    unchanged: item => {
      const hash = extractCommitHash(item.record.path) || '';

      return [
        item.category,
        item.record.displayName,
        item.record.pathSlug,
        item.record.path,
        hash,
        hash,
        '',
        ''
      ];
    }
  });
};

/**
 * Recalculate catalog entries, prune redundant records, update hashes, and recompute manifest metadata.
 *
 * @param catalog - Source documentation catalog
 * @param [options={}] - Options for recalculation
 * @returns Updated PatternFlyMcpDocsCatalog
 */
const recalculateManifestMetadata = (
  catalog: PatternFlyMcpDocsCatalog,
  options: RecalculateOptions = {}
): PatternFlyMcpDocsCatalog => {
  const redundantSet = new Set(
    (options.redundantRecords || []).map(
      report => `${report.category}::${report.record.pathSlug}::${report.record.displayName}`
    )
  );

  const updatedDocs: PatternFlyMcpDocsCatalogEntry = {};

  for (const [category, entries] of Object.entries(catalog.docs || {})) {
    const filteredEntries: PatternFlyMcpDocsCatalogDoc[] = [];

    for (const doc of entries) {
      const key = `${category}::${doc.pathSlug}::${doc.displayName}`;

      if (redundantSet.has(key)) {
        continue;
      }

      let updatedPath = doc.path;

      // Update commit hash if new hash is available and doc is not a pinned one-off / v5
      if (options.latestHashes && doc.path && typeof doc.path === 'string') {
        const repoInfo = extractRepoInfo(doc.path);

        if (repoInfo && repoInfo.ref !== 'v5') {
          const repoKey = `${repoInfo.owner}/${repoInfo.repo}`;
          const newSha = options.latestHashes.get(repoKey) || options.latestHashes.get(repoInfo.repo);

          // Update if repo is recognized and not a pinned historical reference
          if (newSha && !PINNED_HISTORICAL_REFS.has(repoInfo.ref)) {
            updatedPath = `https://raw.githubusercontent.com/${repoInfo.owner}/${repoInfo.repo}/${newSha}/${repoInfo.filePath}`;
          }
        }
      }

      filteredEntries.push({
        ...doc,
        path: updatedPath
      });
    }

    if (filteredEntries.length > 0) {
      updatedDocs[category] = filteredEntries;
    }
  }

  const totalEntries = Object.keys(updatedDocs).length;
  const totalDocs = Object.values(updatedDocs).reduce((acc, arr) => acc + arr.length, 0);

  return {
    version: catalog.version || '1',
    generated: new Date().toISOString(),
    meta: {
      totalEntries,
      totalDocs,
      source: catalog.meta?.source || 'patternfly-mcp'
    },
    docs: updatedDocs
  };
};

export {
  AI_GUIDELINE_ALIASES,
  PINNED_HISTORICAL_REFS,
  diffDocsManifests,
  findApiRedundantDocs,
  generateReportCsv,
  recalculateManifestMetadata,
  resolveApiEndpointForAiDoc,
  type ApiCollectionRecordRef,
  type GenerateCsvReportOptions,
  type DocsAddedRecordReport,
  type DocsDiffResult,
  type DocsModifiedRecordReport,
  type DocsRemovedRecordReport,
  type DocsUnchangedRecordReport,
  type RecalculateOptions
};
