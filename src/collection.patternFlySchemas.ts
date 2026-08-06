import {
  componentNames as pfComponentNames
} from '@patternfly/patternfly-component-schemas/json';
import { type McpCollection, type McpCollectionRecord } from './collections';
import { getPatternFlyVersionContext } from './patternFly.helpers';
import {
  getOptions,
  getSessionOptions,
  runWithOptions,
  runWithSession
} from './options.context';

/**
 * Async collect and process entries for a collection.
 *
 * @returns {Promise<McpCollectionResult>} Object containing a list of processed records.
 */
const collectionCallback = async () => {
  const { latestSchemasVersion } = await getPatternFlyVersionContext.memo();
  const recordsMap: Map<string, McpCollectionRecord> = new Map();

  pfComponentNames.forEach(name => {
    const normalizedName = name.toLowerCase();
    const id = `schema::${normalizedName}`;

    if (recordsMap.has(id)) {
      return;
    }

    const record = {
      id,
      sourceId: normalizedName,
      sourceType: 'package' as const,
      data: {
        [normalizedName]: [
          {
            displayName: name,
            description: `PatternFly React component: ${name}`,
            pathSlug: `schemas-${normalizedName}`,
            category: 'react',
            section: 'components',
            source: 'schemas',
            version: latestSchemasVersion,
            isSchemasAvailable: true
          }
        ]
      }
    };

    recordsMap.set(record.id, record);
  });

  if (!recordsMap.has('schema::table')) {
    recordsMap.set('schema::table', {
      id: 'schema::table',
      sourceId: 'table',
      sourceType: 'package' as const,
      data: {
        table: [{
          displayName: 'Table',
          description: 'PatternFly React component: table',
          pathSlug: 'schemas-table',
          category: 'react',
          section: 'components',
          source: 'schemas',
          version: latestSchemasVersion,
          isSchemasAvailable: false
        }]
      }
    });
  }

  return { records: [...recordsMap.values()] };
};

/**
 * Create a PatternFly Component Schemas collection from `@patternfly/patternfly-component-schemas`.
 *
 * @param options - Global options
 * @param session - Session options
 * @returns {McpCollection} The collection definition tuple
 */
const patternFlySchemasCollection = (options = getOptions(), session = getSessionOptions()): McpCollection => {
  const callback: McpCollection[1] = async () =>
    runWithSession(session, async () =>
      runWithOptions(options, async () => collectionCallback()));

  return [
    'patternfly-component-schemas',
    callback,
    {
      isRequired: true
    }
  ];
};

export {
  patternFlySchemasCollection,
  collectionCallback
};
