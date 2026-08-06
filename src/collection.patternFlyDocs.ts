import { type McpCollection, type McpCollectionRecord } from './collections';
import { EMBEDDED_DOCS, type PatternFlyMcpDocsCatalog } from './docs.embedded';
import { formatUnknownError, log } from './logger';

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
 * Collection representing local static docs.json (EMBEDDED_DOCS / local import).
 */
const patternFlyDocsCollection = (): McpCollection => {
  const callback = async () => {
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

  return [
    'patternfly-docs',
    callback,
    {
      isRequired: true
    }
  ];
};

/**
 * A collection name, typically the first entry in the tuple. Used in logging and deduplication.
 */
patternFlyDocsCollection.collectionName = 'patternfly-docs';

export { patternFlyDocsCollection };
