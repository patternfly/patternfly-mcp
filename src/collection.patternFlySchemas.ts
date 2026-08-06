import {
  componentNames as pfComponentNames
} from '@patternfly/patternfly-component-schemas/json';
import { type McpCollection, type McpCollectionRecord } from './collections';
import { getPatternFlyVersionContext } from './patternFly.helpers';

/**
 * Component schemas collection from @patternfly/patternfly-component-schemas.
 *
 * @returns Component schemas collection from @patternfly/patternfly-component-schemas.
 */
const patternFlySchemasCollection = (): McpCollection => {
  const callback = async () => {
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

  return [
    'patternfly-component-schemas',
    callback,
    {
      isRequired: true
    }
  ];
};

export {
  patternFlySchemasCollection
};
