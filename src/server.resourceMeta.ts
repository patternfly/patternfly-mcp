import {
  ResourceTemplate,
  type CompleteResourceTemplateCallback
} from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  type McpResource,
  type McpResourceCreator,
  type McpResourceMetadata,
  type McpResourceMetadataMetaConfig
} from './server';
import {
  buildSearchString,
  isPlainObject,
  listAllCombinations,
  listIncrementalCombinations,
  splitUri,
  stringJoin
} from './server.helpers';
import { getOptions, runWithOptions } from './options.context';

/**
 * Type definition for options used in setting up resource metadata.
 *
 * @interface SetMetadataOptions
 *
 * @property name - The name of the resource.
 * @property baseUri - The base URI for the resource.
 * @property searchParams - List of search parameters for the resource.
 * @property {McpResource[2]} config - Configuration for the resource.
 * @property {McpResourceMetadataMetaConfig | undefined} metaConfig - Metadata configuration for the resource.
 * @property {McpResourceMetadata['complete']} complete - Completion function for the resource metadata.
 * @property {McpResourceMetadata['registerAllSearchCombinations']} registerAllSearchCombinations - Boolean indicating
 *     whether to register all search combinations for the resource metadata.
 */
interface SetMetadataOptions {
  name: string;
  baseUri: string;
  searchParams: string[];
  config: McpResource[2];
  metaConfig: McpResourceMetadataMetaConfig | undefined;
  complete: McpResourceMetadata['complete'];
  registerAllSearchCombinations: McpResourceMetadata['registerAllSearchCombinations'];
}

/**
 * Generate a basic Markdown table with optional content wrapping.
 *
 * @note Consider relocating this function to somewhere like a "resourceHelpers"
 * if we end up using it in multiple places.
 *
 * @param columnHeaders - Column headers for the table.
 * @param rows - Rows of data to include in the table.
 * @param [options] - Options for table generation.
 * @param [options.wrapContents] - Optional array of booleans that aligns to each column and indicates whether to wrap the content.
 * @returns A Markdown table string.
 */
const generateMarkdownTable = (columnHeaders: string[], rows: (string | string[])[][], { wrapContents = [] }: { wrapContents?: boolean[] } = {}) => {
  const wrapValue = (value: string | string[], index: number) => {
    if (!wrapContents[index]) {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map(val => `\`${val}\``).join(', ');
    }

    return `\`${value}\``;
  };

  const tableRows = rows.map(row => `| ${row.slice(0, columnHeaders.length).map((cell, index) => wrapValue(cell, index)).join(' | ')} |`);
  const tableHeader = `| ${columnHeaders.join(' | ')} |`;
  const tableSeparator = `| ${columnHeaders.map(() => ':---').join(' | ')} |`;

  return stringJoin.newline(
    tableHeader,
    tableSeparator,
    ...tableRows
  );
};

/**
 * Generate a standardized metadata table for resource discovery.
 *
 * @param param - Object parameter
 * @param param.title - Heading title for the generated Markdown.
 * @param param.description - Resource description/summary for the Markdown.
 * @param param.params - Resource rows for the parameters Markdown table.
 * @param [param.exampleUris] - Example URIs for the resource "Available Patterns" Markdown section.
 * @returns Markdown content for resource metadata.
 */
const generateMetaContent = ({ title, description, params, exampleUris = [] }: {
  title: string;
  description: string;
  params: { name: string; values: string[]; description: string }[];
  exampleUris?: { label: string; uri: string }[];
}) => {
  let table = '';
  let examples = '';

  if (params.length) {
    const tableRows = params.map(({ name, values, description }) => [name, values, description]);

    table = stringJoin.newline(
      '',
      '## Available Parameters',
      '',
      generateMarkdownTable(['Parameter', 'Valid Values', 'Description'], tableRows, { wrapContents: [true, true, false] })
    );
  }

  if (exampleUris.length) {
    const exampleUriLines = exampleUris.map(example => `- **${example.label}**: \`${example.uri}\``);

    examples = stringJoin.newline(
      '',
      '## Available Patterns',
      ...exampleUriLines
    );
  }

  return stringJoin.newline(
    `# ${title}`,
    description,
    table,
    examples
  );
};

/**
 * Get all registered URI variations for a template.
 *
 * @param baseUri - The base URI string.
 * @param params - The variable names.
 * @param [allCombos=false] - Whether to generate all permutations.
 * @returns Array of formatted URI examples.
 */
const getUriVariations = (baseUri: string, params: string[], allCombos = false): string[] => {
  const combinations = allCombos ? listAllCombinations(params) : listIncrementalCombinations(params);

  return combinations.map(combo => {
    let str = baseUri;

    if (combo.length) {
      str += `?${combo.map(param => `${param}=...`).join('&')}`;
    }

    return str;
  });
};

/**
 * Configures and returns metadata options based on the provided parameters and configuration.
 *
 * @note The `metaHandler` must be a function (sync or async) to align with the MCP SDK.
 * If a provided handler is not a function, a default fallback async handler is used,
 * see type `McpResourceMetadataMetaConfig`.
 *
 * @note The generated `metaHandler` attempts to run any related "completion" callbacks. If they
 * fail, the handler silently ignores the error and continues execution. This is by design and
 * related to our concept of meta-resources providing an alternative avenue for MCP clients
 * lacking completion.
 *
 * @param {SetMetadataOptions} settings - Settings for configuring metadata options.
 * @returns An object containing the configured metadata options.
 */
const setMetadataOptions = ({ name, baseUri, searchParams, metaConfig, config, complete, registerAllSearchCombinations }: SetMetadataOptions) => {
  // Set basic meta-properties from config or create them.
  const metaName = metaConfig?.name || `${name}-meta`;
  const metaTitle = metaConfig?.title || `${config.title} Metadata`;
  const metaDescription = metaConfig?.description || `Discovery manual for ${config.title}.`;
  const metaMimeType = metaConfig?.mimeType || 'text/markdown';
  let metaHandler = metaConfig?.metaHandler;

  if (typeof metaHandler !== 'function') {
    // Generated example URIs for fallback handler
    const exampleUris = getUriVariations(baseUri, searchParams, Boolean(registerAllSearchCombinations)).map(uri => {
      const splitSearchParams = uri.split('?')[1];

      return {
        label: !splitSearchParams ? 'Base View' : `Filtered View (${splitSearchParams})`,
        uri
      };
    });

    // Fallback handler for generating metadata content
    metaHandler = async (passedParams: Record<string, string> | undefined) => {
      const updatedParams = isPlainObject(passedParams) ? passedParams : {};
      const params = [];

      if (isPlainObject(complete)) {
        for (const prop in complete) {
          const name = prop;
          const description = `Filter by ${name}`;
          let values: string[] = [];

          if (complete[prop]) {
            try {
              values = await complete[prop]('', { arguments: { ...updatedParams } });
            } catch {}
          }

          params.push({ name, values, description });
        }
      }

      return generateMetaContent({
        title: metaTitle,
        description: metaDescription,
        params,
        exampleUris
      });
    };
  }

  return {
    metaName,
    metaTitle,
    metaDescription,
    metaMimeType,
    metaHandler
  };
};

/**
 * Generate related metadata URIs and parameters.
 *
 * @param options - Input options
 * @param options.uriOrTemplate - Original URI or a `ResourceTemplate` instance to parse.
 * @param options.configUri - Passed metadata configuration URI.
 * @param options.searchFields - Passed metadata "searchFields" settings associated with the resource.
 * @returns Breakdown used to build meta resources and templates.
 *  - `isMetaTemplate` - Whether the meta resource uses a `ResourceTemplate` (query variables).
 *  - `originalBaseUri` - Base URI of the source resource (before `/meta`), from the original template or string.
 *  - `originalSearchParams` - Query parameter names from the source URI template `{?...}` segment.
 *  - `metaBaseUri` - Static meta path (no `{?...}`), e.g. `originalBaseUri + '/meta'` or the base of `configUri`.
 *  - `metaUri` - Full meta URI, either `metaBaseUri` or `metaBaseUri{?a,b,...}` when there are variables.
 *  - `metaSearchParams` - Names included in the meta template; driven by `searchFields`, `configUri`, or the original template.
 */
const getUriBreakdown = ({ uriOrTemplate, configUri, searchFields }: {
  uriOrTemplate: string | ResourceTemplate,
  configUri: McpResourceMetadataMetaConfig['uri'],
  searchFields: McpResourceMetadataMetaConfig['searchFields']
}) => {
  const isResourceTemplate = uriOrTemplate instanceof ResourceTemplate;
  let metaUri = configUri;
  let metaBaseUri: string | undefined;

  const tempOriginalUri = isResourceTemplate ? uriOrTemplate.uriTemplate?.toString() : uriOrTemplate;

  const { base: originalBaseUri, search: searchOriginalKeys } = splitUri(tempOriginalUri);
  const { search: metaSearchKeys } = metaUri ? splitUri(metaUri) : {};

  const originalSearchParams = (searchOriginalKeys?.length && searchOriginalKeys) || [];
  const tempMetaSearchParams = (metaSearchKeys?.length && metaSearchKeys) || [];

  // If `searchFields` is set, use it regardless of length.
  const metaSearchParams = (Array.isArray(searchFields) && searchFields) || (metaUri && tempMetaSearchParams) || originalSearchParams;

  const isMetaTemplate = isResourceTemplate || metaSearchParams.length > 0;

  if (metaUri) {
    const { base } = splitUri(metaUri);

    metaBaseUri = base;
  } else if (originalBaseUri) {
    metaBaseUri = `${originalBaseUri}/meta`;
  }

  metaUri = metaBaseUri;

  if (metaSearchParams?.length) {
    metaUri = `${metaBaseUri}{?${metaSearchParams.join(',')}}`;
  }

  return {
    isMetaTemplate,
    originalBaseUri,
    originalSearchParams,
    metaBaseUri,
    metaUri,
    metaSearchParams
  };
};

/**
 * Enhances and generates meta-resources for a set of resources.
 *
 * - Adds a new meta-resource if a configuration is provided
 * - Modifies the original resource to indicate a meta-resource is available
 *
 * @note Review needing to apply session context. We currently don't apply it in `resource.*.ts`
 * either, but it is applied in `server.ts`.
 *
 * @param {McpResourceCreator[]} resources - List of resource creators to process and enhance.
 * @param [options] - Optional settings.
 * @returns {McpResourceCreator[]} An updated list of resource creators, including any added or modified meta-resources.
 */
const setMetaResources = (resources: McpResourceCreator[], options = getOptions()) => {
  const updatedResources: McpResourceCreator[] = [];

  // Check each resource for meta-config
  resources.forEach(resourceCreator => {
    const [name, uriOrTemplate, config, callback, metadata] = resourceCreator(options);

    // No meta-config available, move to the next resource
    if (!metadata?.metaConfig) {
      updatedResources.push(resourceCreator);

      return;
    }

    // Get a URI breakdown
    const uriBreakdown = getUriBreakdown({
      uriOrTemplate,
      configUri: metadata.metaConfig.uri,
      searchFields: metadata.metaConfig.searchFields
    });

    // If no URI breakdown assume resource is still valid
    if (!uriBreakdown.metaBaseUri || !uriBreakdown.metaUri || !uriBreakdown.originalBaseUri) {
      updatedResources.push(resourceCreator);

      return;
    }

    // Create a new meta-resource or template
    // We still allow complete even though the intent of `meta` resource is to provide a
    // way around completion for "lesser" MCP clients since technically, those clients can still
    // pass a version parameter based on the meta URI template.
    let metaResourceOrTemplate: string | ResourceTemplate = uriBreakdown.metaUri;

    if (uriBreakdown.isMetaTemplate) {
      const updatedComplete: { [variable: string]: CompleteResourceTemplateCallback; } = {};

      if (isPlainObject(metadata.complete)) {
        Object.entries(metadata.complete).forEach(([key, value]) => {
          if (uriBreakdown.metaSearchParams.includes(key)) {
            updatedComplete[key] = value;
          }
        });
      }

      metaResourceOrTemplate = new ResourceTemplate(uriBreakdown.metaUri, {
        list: undefined,
        ...(Object.keys(updatedComplete).length ? { complete: updatedComplete } : {})
      });
    }

    // Set meta-properties
    const { metaName, metaTitle, metaDescription, metaMimeType, metaHandler } = setMetadataOptions({
      name,
      baseUri: uriBreakdown.originalBaseUri,
      searchParams: uriBreakdown.originalSearchParams,
      metaConfig: metadata.metaConfig,
      config,
      complete: metadata.complete,
      registerAllSearchCombinations: metadata.registerAllSearchCombinations
    });

    // Resolve and serialize meta handler output
    const resolveMetaText = async (params: Record<string, string> = {}) => {
      const resourceText = await metaHandler(params);

      return isPlainObject(resourceText) || Array.isArray(resourceText)
        ? JSON.stringify(resourceText, null, 2)
        : String(resourceText);
    };

    // Create a new meta-resource
    const metaResource = (opts = options): McpResource => {
      const metaCallback: McpResource[3] = async (passedUri, variables) =>
        runWithOptions(opts, async () => {
          const updatedText = await resolveMetaText(variables);

          return {
            contents: [
              {
                uri: passedUri?.toString(),
                mimeType: metaMimeType,
                text: updatedText
              }
            ]
          };
        });

      return [
        metaName,
        metaResourceOrTemplate,
        {
          title: metaTitle,
          description: metaDescription,
          mimeType: metaMimeType
        },
        metaCallback
      ];
    };

    // Add the meta-resource enhancement to the existing resource
    const enhancedResource = (opts = options): McpResource => {
      const metaEnhancedCallback: McpResource[3] = async (passedUri, variables) =>
        runWithOptions(opts, async () => {
          const result = await callback(passedUri, variables);

          if (!isPlainObject(result) || !Array.isArray(result.contents)) {
            return result;
          }

          const updatedText = await resolveMetaText(variables);
          const queryString = buildSearchString(variables, { prefix: true });
          const metaContentUri = queryString ? `${uriBreakdown.metaBaseUri}${queryString}` : uriBreakdown.metaBaseUri;

          return {
            ...result,
            contents: [
              ...result.contents,
              {
                uri: metaContentUri,
                mimeType: metaMimeType,
                text: updatedText
              }
            ]
          };
        });

      return [name, uriOrTemplate, config, metaEnhancedCallback, metadata];
    };

    // Add the resources back in
    updatedResources.push(metaResource);
    updatedResources.push(enhancedResource);
  });

  return updatedResources;
};

export {
  generateMetaContent,
  generateMarkdownTable,
  getUriBreakdown,
  getUriVariations,
  setMetadataOptions,
  setMetaResources
};
