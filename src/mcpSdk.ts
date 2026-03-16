import { ResourceTemplate, type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type McpResource } from './server';

/**
 * Register an MCP resource.
 *
 * Capable of registering specific resource variations indicated when a URI template is used,
 * making the parameterized URIs for query/search strings optional instead of required.
 *
 * What's registered:
 * - `original`: The original string or template URI which typically includes ALL parameters.
 * - `base URI`: Template base URI, sans hash, search params
 * - `incremental params URIs`: URIs that incrementally add search params
 *
 * Optional registration:
 * - `all permutations`: Disabled by default, allows creating all search parameter permutations
 *     of resources for registration.
 *
 * Why we only register a limited set of URIs associated with making optional search parameters:
 * - To avoid excessive resource registration.
 * - Combinations of URIs build quickly the more params you have.
 *
 * @note This is a work-around for the MCP SDK's current strict URI Template matching requirements
 * which include:
 * - most params match first
 * - all search params required in templates
 *
 * @note We only support a single `{?...}` query segment. Using `{?a}{?b}{?c}` will fail. Make sure
 * resource URIs are set to use a single `{?a,b,c}` segment.
 *
 * @param {McpServer} server - MCP Server instance
 * @param name - Resource name
 * @param uriOrTemplate - URI or ResourceTemplate
 * @param config - Resource metadata configuration
 * @param callback - Callback function for resource read operations
 * @param metadata - McpResource metadata
 * - `metadata.complete`: Callback functions for resource read operations completion
 * - `metadata.registerAllSearchCombinations`: Whether to register all search parameter permutations or not.
 */
const registerResource = (
  server: McpServer,
  name: McpResource[0],
  uriOrTemplate: McpResource[1],
  config: McpResource[2],
  callback: McpResource[3],
  metadata: McpResource[4]
) => {
  if (!server) {
    return;
  }

  if (uriOrTemplate instanceof ResourceTemplate) {
    const templateStr = uriOrTemplate.uriTemplate?.toString();
    const [remainingBaseUri, remainingUri] = templateStr?.split('{?') || [];

    // Technically, the hash should fall after a query, just a precaution
    const baseUri = remainingBaseUri?.split('{#')?.[0];
    const searchUri = remainingUri?.split('}')?.[0]?.toLowerCase();

    // Register original uri, then all combinations OR incremental search params.
    // Or fail the check and fallthrough to default registration.
    if (baseUri && searchUri) {
      // Register the original template first. MCP SDK matcher limitation.
      server.registerResource(name, uriOrTemplate, config, callback);

      const allVariableNames = uriOrTemplate.uriTemplate.variableNames;
      const searchParams = allVariableNames.filter(param => searchUri.includes(param.toLowerCase()));

      // Register combinations
      const register = (incrementalParams: string[]) => {
        const newUri = incrementalParams.length ? `${baseUri}{?${incrementalParams.join(',')}}` : baseUri;
        const newName = incrementalParams.length ? `${name}-${incrementalParams.join('-')}` : `${name}-empty`;
        const complete = metadata?.complete && { complete: metadata.complete };

        const resourceTemplate = new ResourceTemplate(newUri, {
          list: undefined,
          ...complete
        });

        server.registerResource(newName, resourceTemplate, config, callback);
      };

      // Variation for all combos, including empty
      const paramAllCombinations = (params: string[]) =>
        params.reduce((acc, val) => acc.concat(acc.map(prev => [...prev, val])), [[]] as string[][]);

      // Variation for incremental combos, including empty
      const paramIncrementalCombinations = (params: string[]) =>
        params.reduce((acc, val) => {
          const lastArray = acc[acc.length - 1] || [];

          acc.push([...lastArray, val]);

          return acc;
        }, [[]] as string[][]);

      // Register the remaining combinations
      // Reverse order, limitation with the MCP SDK, most params match first
      const combinations = metadata?.registerAllSearchCombinations
        ? paramAllCombinations(searchParams)
        : paramIncrementalCombinations(searchParams);

      combinations
        .filter(combination => combination.length < searchParams.length)
        .reverse()
        .forEach(combination => register(combination));

      return;
    }
  }

  // Register a string or fallthrough URI if conditional checks fail to match
  // Note: uri is being cast as any to bypass a type mismatch introduced at the MCP SDK level. Rereview when SDK is updated.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  server.registerResource(name, uriOrTemplate as any, config, callback);
};

export { registerResource };
