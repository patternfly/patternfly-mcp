import { type McpCollection, type McpCollectionRecord } from './collections';
import { EMBEDDED_DOCS, type PatternFlyMcpDocsCatalog } from './docs.embedded';
import { formatUnknownError, log } from './logger';
import {
  getOptions,
  getSessionOptions,
  runWithOptions,
  runWithSession
} from './options.context';

/**
 * Lazy load the PatternFly documentation catalog.
 *
 * @returns PatternFly documentation catalog JSON, or fallback catalog if import fails.
 */
const getPatternFlyDocsCatalog = async (): Promise<PatternFlyMcpDocsCatalog & { isFallback: boolean }> => {
  let docsCatalog = EMBEDDED_DOCS;
  let isFallback = false;

  try {
    if (process.env.NODE_ENV === 'local') {
      docsCatalog = (await import('./docs.json', { with: { type: 'json' } })).default;
    } else {
      docsCatalog = (await import('#docsCatalog', { with: { type: 'json' } })).default;
    }
  } catch (error) {
    isFallback = true;
    log.debug(`Failed to import docs catalog '#docsCatalog': ${formatUnknownError(error)}`, 'Using fallback docs catalog.');
  }

  return { ...docsCatalog, isFallback };
};

/**
 * Async collect and process entries for a collection.
 *
 * @returns {Promise<McpCollectionResult>} Object containing a list of processed records.
 */
const collectionCallback = async () => {
  const docsCatalog = await getPatternFlyDocsCatalog();
  const catalog = [...Object.entries(docsCatalog.docs)];
  const recordsMap: Map<string, McpCollectionRecord> = new Map();

  catalog.forEach(([name, entries]) => {
    const normalizedName = name.toLowerCase();
    const id = `docs::${normalizedName}`;

    if (recordsMap.has(id)) {
      return;
    }

    const record = {
      id,
      sourceId: normalizedName,
      sourceType: 'local' as const,
      data: {
        [normalizedName]: entries
      }
    };

    recordsMap.set(record.id, record);
  });

  return { records: [...recordsMap.values()], isFallback: docsCatalog.isFallback };
};

/**
 * Create a PatternFly local embedded docs collection from `docs.json`.
 *
 * @param options - Global options
 * @param session - Session options
 * @returns {McpCollection} The collection definition tuple
 */
const patternFlyDocsCollection = (options = getOptions(), session = getSessionOptions()): McpCollection => {
  const callback: McpCollection[1] = async () =>
    runWithSession(session, async () =>
      runWithOptions(options, async () => collectionCallback()));

  return [
    'patternfly-docs',
    callback,
    {
      isRequired: true
    }
  ];
};

export { patternFlyDocsCollection, collectionCallback };
