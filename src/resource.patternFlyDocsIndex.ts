import { getComponentList, getComponentInfo } from './api.client';
import { getLocalDocs } from './docs.local';
import { type McpResource } from './server';
import { getOptions } from './options.context';
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
 * @param options - Global options
 * @returns {McpResource} The resource definition tuple
 */
const patternFlyDocsIndexResource = (options = getOptions()): McpResource => [
  NAME,
  URI_TEMPLATE,
  CONFIG,
  async () => {
    const componentNames = await getComponentList.memo(options);

    // Group components by section
    const sections = new Map<string, string[]>();

    for (const name of componentNames) {
      const info = await getComponentInfo.memo(name, options);
      const section = info?.section || 'other';

      if (!sections.has(section)) {
        sections.set(section, []);
      }

      sections.get(section)!.push(name);
    }

    const sectionBlocks: string[] = [];

    for (const [section, names] of sections) {
      sectionBlocks.push(
        '',
        `## ${section.charAt(0).toUpperCase() + section.slice(1)}`,
        ...names.map(name => `- ${name}`)
      );
    }

    const localDocs = getLocalDocs();
    const localBlock = localDocs.length > 0
      ? ['', '## Local Documentation', ...localDocs]
      : [];

    const allDocs = stringJoin.newline(
      '# PatternFly Documentation Index',
      ...sectionBlocks,
      ...localBlock
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
