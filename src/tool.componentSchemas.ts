import { z } from 'zod';
import { componentNames, getComponentSchema } from '@patternfly/patternfly-component-schemas';
import type { McpToolCreator } from './server';

const ComponentSchemasInputSchema = z.object({
  action: z
    .enum(['list', 'get', 'search'])
    .describe(
      'Action to perform: list all components, get specific component schema, or search components with fuzzy matching'
    ),
  componentName: z
    .string()
    .optional()
    .describe(
      'Name of the component to get schema for (required when action is "get")'
    ),
  query: z
    .string()
    .optional()
    .describe(
      'Search query for fuzzy matching components (required when action is "search")'
    ),
  limit: z
    .number()
    .optional()
    .describe('Maximum number of search results to return (default: 10)')
});

type ComponentSchemasInput = z.infer<typeof ComponentSchemasInputSchema>;

/**
 * Simple fuzzy search for component names
 *
 * @param query - Search query string
 * @param components - Array of component names to search
 * @param limit - Maximum number of results to return
 */
function searchComponents(
  query: string,
  components: string[],
  limit = 10
): Array<{ name: string; score: number; matchType: string }> {
  const queryLower = query.toLowerCase();
  const results: Array<{ name: string; score: number; matchType: string }> = [];

  for (const component of components) {
    const componentLower = component.toLowerCase();
    let score = 0;
    let matchType = '';

    // Exact match (highest priority)
    if (componentLower === queryLower) {
      score = 1000;
      matchType = 'exact';
    // eslint-disable-next-line @stylistic/brace-style
    }
    // Starts with query (high priority)
    else if (componentLower.startsWith(queryLower)) {
      score = 900 - queryLower.length;
      matchType = 'prefix';
    // eslint-disable-next-line @stylistic/brace-style
    }
    // Contains query (medium priority)
    else if (componentLower.includes(queryLower)) {
      const index = componentLower.indexOf(queryLower);

      score = 800 - index - queryLower.length;
      matchType = 'contains';
    }

    if (score > 0) {
      results.push({ name: component, score, matchType });
    }
  }

  // Sort by score and return top results
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Tool for accessing PatternFly component schemas
 * Provides JSON Schema validation and documentation for PatternFly React components
 */
const componentSchemasTool: McpToolCreator = () => [
  'component-schemas',
  {
    description:
      'Access PatternFly component schemas for validation and documentation. Can list all available components, search with fuzzy matching, or get detailed schema for a specific component.',
    inputSchema: ComponentSchemasInputSchema.describe(
      'Input for component schemas tool'
    )
  },
  async (args: ComponentSchemasInput) => {
    try {
      const { action, componentName, query, limit = 10 } = args;

      if (action === 'list') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  action: 'list',
                  totalComponents: componentNames.length,
                  components: componentNames.sort(),
                  description:
                    'Available PatternFly React components with JSON Schema validation'
                },
                null,
                2
              )
            }
          ]
        };
      }

      if (action === 'search') {
        if (!query) {
          throw new Error('query is required when action is "search"');
        }

        const searchResults = searchComponents(query, componentNames, limit);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  action: 'search',
                  query,
                  totalResults: searchResults.length,
                  results: searchResults,
                  description: `Search results for "${query}"`
                },
                null,
                2
              )
            }
          ]
        };
      }

      if (action === 'get') {
        if (!componentName) {
          throw new Error('componentName is required when action is "get"');
        }

        // First try exact match
        if (!componentNames.includes(componentName)) {
          // If no exact match, provide search suggestions
          const suggestions = searchComponents(
            componentName,
            componentNames,
            5
          );

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    error: `Component "${componentName}" not found`,
                    suggestions: suggestions.map(s => ({
                      name: s.name,
                      matchType: s.matchType,
                      confidence: Math.round((s.score / 1000) * 100)
                    })),
                    suggestion:
                      suggestions.length > 0
                        ? `Did you mean "${suggestions[0]?.name}"? Use the "search" action for more options.`
                        : 'Use the "search" action to find similar components.'
                  },
                  null,
                  2
                )
              }
            ]
          };
        }

        const componentSchema = await getComponentSchema(componentName);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  action: 'get',
                  componentName: componentSchema.componentName,
                  propsCount: componentSchema.propsCount,
                  requiredProps: componentSchema.requiredProps || [],
                  schema: componentSchema.schema,
                  description: `JSON Schema for ${componentName} component props`
                },
                null,
                2
              )
            }
          ]
        };
      }

      throw new Error(`Unknown action: ${action}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: errorMessage,
                usage: {
                  listComponents: { action: 'list' },
                  searchComponents: { action: 'search', query: 'button' },
                  getComponentSchema: {
                    action: 'get',
                    componentName: 'Button'
                  }
                }
              },
              null,
              2
            )
          }
        ]
      };
    }
  }
];

export { componentSchemasTool };
