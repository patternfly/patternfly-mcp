import { componentNames } from '@patternfly/patternfly-component-schemas/json';
import { type McpResource } from './server';
import { stringJoin } from './server.helpers';

/**
 * Name of the resource.
 */
const NAME = 'patternfly-schemas-index';

/**
 * URI template for the resource.
 */
const URI_TEMPLATE = 'patternfly://schemas/index';

/**
 * Resource configuration.
 */
const CONFIG = {
  title: 'PatternFly Component Schemas Index',
  description: 'A list of all PatternFly component names available for JSON Schema retrieval',
  mimeType: 'text/markdown'
};

/**
 * Resource creator for the component schemas index.
 *
 * @returns {McpResource} The resource definition tuple
 */
const patternFlySchemasIndexResource = (): McpResource => [
  NAME,
  URI_TEMPLATE,
  CONFIG,
  async () => ({
    contents: [{
      uri: 'patternfly://schemas/index',
      mimeType: 'text/markdown',
      text: stringJoin.newline(
        '# PatternFly Component Names Index',
        '',
        '',
        ...componentNames
      )
    }]
  })
];

export { patternFlySchemasIndexResource, NAME, URI_TEMPLATE, CONFIG };
