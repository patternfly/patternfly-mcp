import { processDocsFunction } from './server.getResources';
import { type McpCollection, type McpCollectionRecord } from './collections';
import { getOptions, getSessionOptions, runWithOptions, runWithSession } from './options.context';
import { formatUnknownError, log } from './logger';
import { isPlainObject } from './server.helpers';

const COLLECTION_DOCS = 'https://raw.githubusercontent.com/rh-uxd/ai-handbook/refs/heads/main/docs.json';

/**
 * Lazy load the documentation catalog.
 *
 * @param [collectionDocs] - URL to the documentation catalog JSON.
 * @returns Documentation catalog JSON.
 */
const getCatalog = async (collectionDocs = COLLECTION_DOCS): Promise<Record<string, any>> => {
  let docsCatalog = { docs: {} };

  const settled = (await processDocsFunction([collectionDocs])) || [];

  for (const res of settled) {
    if (!res.isSuccess) {
      continue;
    }

    try {
      const docsJson = typeof res.content === 'string' ? JSON.parse(res.content) : res.content;

      if (isPlainObject(docsJson.docs)) {
        docsCatalog = docsJson;
      }
    } catch (error) {
      log.debug(`Failed to parse AI Handbook '${collectionDocs}': ${formatUnknownError(error)}`);
    }
  }

  return { ...docsCatalog };
};

/**
 * Async collect and process entries for a collection.
 *
 * @returns {Promise<McpCollectionResult>} Object containing a list of processed records.
 */
const collectionCallback = async () => {
  const docsCatalog = await getCatalog();
  const catalog = [...Object.entries(docsCatalog.docs)];
  const recordsMap: Map<string, McpCollectionRecord> = new Map();

  catalog.forEach(([name, entries]) => {
    const normalizedName = name.toLowerCase();
    const id = `docs::ai-handbook::${normalizedName}`;

    if (recordsMap.has(id) || !Array.isArray(entries)) {
      return;
    }

    const record = {
      id,
      sourceId: normalizedName,
      sourceType: 'local' as const,
      data: {
        [normalizedName]: entries.filter(entry => isPlainObject(entry)).map(data => ({
          ...data,
          collection: 'ai-handbook' as const
        }))
      }
    };

    recordsMap.set(record.id, record);
  });

  return { records: [...recordsMap.values()] };
};

/**
 * Create an AI Handbook local embedded collection.
 *
 * @param options - Global options
 * @param session - Session options
 * @returns {McpCollection} The collection definition tuple
 */
const aiHandbookCollection = (options = getOptions(), session = getSessionOptions()): McpCollection => {
  const callback: McpCollection[2] = async () =>
    runWithSession(session, async () =>
      runWithOptions(options, async () => collectionCallback()));

  return [
    'ai-handbook',
    {
      title: 'AI Handbook'
    },
    callback,
    {
      // FixMe: Temporarily requiring this collection to bypass MCP resource memoization. The solution involves leveraging the
      //  "on update" collection handler to inform the server of changes.
      isRequired: true,
      retainLastViable: true
    }
  ];
};

export { aiHandbookCollection, collectionCallback };
