import { getComponentList, getComponentInfo } from './api.client';
import { type McpResource } from './server';
import { getOptions } from './options.context';
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
  description: 'A list of all PatternFly component names available for prop schema retrieval',
  mimeType: 'text/markdown'
};

/**
 * Resource creator for the component schemas index.
 *
 * @param options - Global options
 * @returns {McpResource} The resource definition tuple
 */
const patternFlySchemasIndexResource = (options = getOptions()): McpResource => [
  NAME,
  URI_TEMPLATE,
  CONFIG,
  async () => {
    const componentNames = await getComponentList.memo(options);
    const withProps: string[] = [];

    for (const name of componentNames) {
      const info = await getComponentInfo.memo(name, options);

      if (info?.hasProps) {
        withProps.push(name);
      }
    }

    return {
      contents: [{
        uri: 'patternfly://schemas/index',
        mimeType: 'text/markdown',
        text: stringJoin.newline(
          '# PatternFly Component Schemas Index',
          '',
          ...withProps.map(name => `- ${name}`)
        )
      }]
    };
  }
];

export { patternFlySchemasIndexResource, NAME, URI_TEMPLATE, CONFIG };
