import { COMPONENT_DOCS } from './docs.component';
import { LAYOUT_DOCS } from './docs.layout';
import { CHART_DOCS } from './docs.chart';
import { getLocalDocs } from './docs.local';
import { type McpResource } from './server';
import { stringJoin } from './server.helpers';

/**
 * Name of the resource.
 */
const NAME = 'patternfly-docs-index';

/**
 * URI template for the resource.
 */
const URI_TEMPLATE = 'patternfly://docs/index';

/**
 * Resource configuration.
 */
const CONFIG = {
  title: 'PatternFly Documentation Index',
  description: 'A comprehensive list of PatternFly documentation links, organized by components, layouts, charts, and local files.',
  mimeType: 'text/markdown'
};

/**
 * Resource creator for the documentation index.
 *
 * @returns {McpResource} The resource definition tuple
 */
const patternFlyDocsIndexResource = (): McpResource => [
  NAME,
  URI_TEMPLATE,
  CONFIG,
  async () => {
    const allDocs = stringJoin.newline(
      '# PatternFly Documentation Index',
      '',
      '## Components',
      ...COMPONENT_DOCS,
      '',
      '## Layouts',
      ...LAYOUT_DOCS,
      '',
      '## Charts',
      ...CHART_DOCS,
      '',
      '## Local Documentation',
      ...getLocalDocs()
    );

    return {
      contents: [
        {
          uri: 'patternfly://docs/index',
          mimeType: 'text/markdown',
          text: allDocs
        }
      ]
    };
  }
];

export { patternFlyDocsIndexResource, NAME, URI_TEMPLATE, CONFIG };
