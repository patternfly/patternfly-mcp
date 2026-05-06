import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type McpResource, type McpResourceMetadata } from './server';
import { memo } from './server.caching';
import { assertInputStringLength } from './server.assertions';
import { getOptions } from './options.context';
import { getAiHelpersSkills, getAiHelpersSkillContent } from './aiHelpers.skills';

/**
 * Name of the resource template.
 */
const NAME = 'aihelpers-skills-template';

/**
 * URI template for the resource.
 */
const URI_TEMPLATE = 'aihelpers://skills/{name}';

/**
 * Resource configuration.
 */
const CONFIG = {
  title: 'ai-helpers Skill',
  description: `Retrieve the full content of a specific ai-helpers skill by name. ${URI_TEMPLATE}`,
  mimeType: 'text/markdown' as const
};

/**
 * Name completion callback for the URI template.
 *
 * @param value - The partial name to match against.
 */
const uriNameComplete = async (value: string) => {
  const skills = await getAiHelpersSkills();
  const lower = (value || '').toLowerCase();

  return skills
    .map(skill => skill.name)
    .filter(name => name.toLowerCase().includes(lower))
    .sort();
};

uriNameComplete.memo = memo(uriNameComplete);

/**
 * Resource callback.
 *
 * @param passedUri - The resolved URI for this resource request.
 * @param variables - The URI template variables extracted from the request.
 * @param options - Server options (defaults to current context options).
 */
const resourceCallback = async (passedUri: URL, variables: Record<string, string | string[]>, options = getOptions()) => {
  const { name } = variables || {};

  assertInputStringLength(name, {
    ...options.minMax.inputStrings,
    inputDisplayName: 'name'
  });

  const skillName = Array.isArray(name) ? name[0] : name;
  const content = await getAiHelpersSkillContent(skillName);

  if (!content) {
    return {
      contents: [
        {
          uri: passedUri?.toString(),
          mimeType: 'text/markdown',
          text: `Skill "${skillName}" not found. Use \`aihelpers://skills/index\` to list available skills.`
        }
      ]
    };
  }

  return {
    contents: [
      {
        uri: passedUri?.toString(),
        mimeType: 'text/markdown',
        text: content
      }
    ]
  };
};

/**
 * Metadata for the resource.
 */
const METADATA: McpResourceMetadata = {
  complete: {
    name: uriNameComplete.memo
  }
};

/**
 * Resource creator for individual ai-helpers skills.
 */
const aiHelpersSkillsTemplateResource = (): McpResource => [
  NAME,
  new ResourceTemplate(URI_TEMPLATE, {
    list: undefined,
    complete: {
      name: uriNameComplete.memo
    }
  }),
  CONFIG,
  resourceCallback,
  METADATA
];

export { aiHelpersSkillsTemplateResource, NAME, URI_TEMPLATE, CONFIG };
