import {
  ResourceTemplate,
  type McpServer,
  type ResourceMetadata,
  type CompleteResourceTemplateCallback
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Tool } from '@modelcontextprotocol/sdk/types.js';
import { type GlobalOptions } from './options';
import { listAllCombinations, listIncrementalCombinations, splitUri } from './server.helpers';

/**
 * A tool registered with the MCP server.
 *
 * @note Use of `any` here is intentional as part of this typing. This is part of a general
 * pass-through policy around our SDK types.
 * - `inputSchema`: Input schemas are actually reconstructed as part of the
 * tools-as-plugins architecture to help guarantee that a minimal tool schema is
 * always available and minimally valid.
 *
 * 0. `name` `{string}`: Name of the tool.
 * 1. `schema` `{Object}`: Descriptions and schemas provided to allow parameter input and outputs in a standardized format.
 *    - `schema.description` `{string}`: Concise description of functionality for the tool.
 *    - `schema.inputSchema` `{*}`: Internally, a raw Zod schema. Externally, a JSON or raw Zod schema. External tools are
 *       converted to Zod for user convenience.
 *    - `schema.annotations` `{Object}`: Optional annotations for the tool.
 * 2. `handler` `{Function}`: Resource handler function for returning content.
 * 3. `_config` `{Object}`: Internal Tool configuration.
 *    - `config.shouldRegister`: Optional callback to determine if the tool should be registered.
 */
type McpTool = [
  name: string,
  schema: {
    description: string;
    inputSchema: any;
    annotations?: Tool['annotations'] | any;
  },
  handler: (arg?: unknown) => any | Promise<any>,
  _config?: {
    shouldRegister?: (options: GlobalOptions) => boolean | Promise<boolean>;
  }
];

/**
 * A function that creates a tool registered with the MCP server.
 */
type McpToolCreator = ((options?: GlobalOptions) => McpTool) & { toolName?: string };

/**
 * Configuration for a generated metadata MCP resource.
 *
 * @interface McpResourceMetadataMetaConfig
 *
 * @property [uri] - Override URI for the meta-resource. (e.g., `test://lorem/meta`, `test://ipsum/meta{?var}`).
 * @property [name] - Registered name for the meta-resource (defaults to `{primaryName}-meta`).
 * @property [title] - Title shown for the meta-resource in listings and generated Markdown.
 * @property [description] - Description for the meta-resource in listings and generated Markdown.
 * @property [searchFields] - Query parameter names included on the meta-URI template for completion.
 *   - If an empty array is provided the meta-resource uses a static URI, no template
 *   - If omitted the search fields are inferred from the `uri` or the primary resource template.
 * @property [mimeType] - MIME type of the meta-resource body. Acceptable values are:
 *   - 'text/markdown'
 *   - 'application/json'
 * @property [metaHandler] - A custom handler for the meta-resource. It accepts an optional object as its
 *     argument for passing parameters and returns a serialized value to the MCP client. A default fallback
 *     async handler is used if none is provided.
 */
interface McpResourceMetadataMetaConfig {
  uri?: string;
  name?: string;
  title?: string;
  description?: string;
  valueLimit?: number | undefined;
  searchFields?: string[] | undefined;
  mimeType?: 'text/markdown' | 'application/json';
  metaHandler?: (params: Record<string, string> | undefined) => Promise<unknown> | unknown;
}

/**
 * A resource metadata configuration for the MCP server.
 *
 * @property registerAllSearchCombinations - Whether to register all search combinations for the resource.
 * @property metaConfig - Optional configuration for generating a metadata resource. Being defined
 *     (e.g. `{ metadata: { metaConfig: {} }}`) means a meta-resource will be generated for the related MCP resource.
 * @property complete - Callback functions for resource completion.
 */
interface McpResourceMetadata {
  registerAllSearchCombinations?: boolean | undefined;
  metaConfig?: McpResourceMetadataMetaConfig;
  complete?: {
    [key: string]: CompleteResourceTemplateCallback;
  } | undefined;
  [key: string]: unknown;
}

/**
 * A resource registered with the MCP server.
 *
 * 0. `name` `{string}`: Registered name of the resource.
 * 1. `uriOrTemplate` `{string}`: URI string or template. {@link ResourceTemplate}
 * 2. `config` `{Object}`: Resource configuration metadata. {@link ResourceMetadata}
 * 3. `handler` `{Function}`: Resource handler function.
 * 4. `metadata` `{Object}`: Optional **internal metadata** object, not used by the standard MCP SDK
 *     resource registry. {@link McpResourceMetadata}
 * 5. `_config` `{Object}`: Internal Resource configuration.
 *    - `_config.shouldRegister` `{Function|Promise}`: Optional callback to determine if the resource should be registered.
 *
 * @note Annotations help with prioritizing resources and help manage context. They contain 3 primary properties:
 * - `priority`: A ranking from `0.0` to `1.0`. `1.0` being the highest priority, and `0.0` being the lowest.
 * - `audience`: This can be `user` or `assistant`, possibly both.
 * - `lastModified`: an ISO 8601 formatted string, representing the last time the resource was modified, helps invalidate caches.
 *
 * How to assign a priority:
 * - `Indexes`: A resource index for directory nav is generally higher `0.8` to `1.0`, it's an anchor
 *     point if the model needs a map.
 * - `Dynamic resource templates`: A resource template that contains dynamic content is generally lower `0.3` to `0.5`,
 *     it's a placeholder for a resource, and can generally shift. It can also be reattained by calling again.
 */
type McpResource = [
  name: string,
  uriOrTemplate: string | ResourceTemplate,
  config: ResourceMetadata,
  handler: (...args: any[]) => any | Promise<any>,
  metadata?: McpResourceMetadata | undefined,
  _config?: {
    shouldRegister?: (options: GlobalOptions) => boolean | Promise<boolean>;
  } | undefined
];

/**
 * A function that creates a resource registered with the MCP server.
 */
type McpResourceCreator = ((options?: GlobalOptions) => McpResource) & { resourceName?: string };

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
    const { base: baseUri, search: searchUri } = splitUri(templateStr);

    // Register original uri, then all combinations OR incremental search params.
    // Or fail the check and fallthrough to default registration.
    if (baseUri && searchUri) {
      // Register the original template first. MCP SDK matcher limitation.
      server.registerResource(name, uriOrTemplate, config, callback);

      const allVariableNames = uriOrTemplate.uriTemplate.variableNames;
      const searchParams = allVariableNames.filter(param => searchUri.some(searchParam => searchParam === param.toLowerCase()));

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

      // Register the remaining combinations
      // Reverse order, limitation with the MCP SDK, most params match first
      const combinations = metadata?.registerAllSearchCombinations
        ? listAllCombinations(searchParams)
        : listIncrementalCombinations(searchParams);

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

export {
  registerResource,
  type McpTool,
  type McpToolCreator,
  type McpResourceMetadataMetaConfig,
  type McpResourceMetadata,
  type McpResource,
  type McpResourceCreator
};
