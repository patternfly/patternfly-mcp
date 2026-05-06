import { type McpResource } from './server';
import { stringJoin } from './server.helpers';
import { getAiHelpersSkills } from './aiHelpers.skills';

/**
 * Name of the resource.
 */
const NAME = 'aihelpers-skills-index';

/**
 * URI for the resource.
 */
const URI = 'aihelpers://skills/index';

/**
 * Resource configuration.
 */
const CONFIG = {
  title: 'ai-helpers Skills Index',
  description: 'Lists all available ai-helpers skills with names and descriptions.',
  mimeType: 'text/markdown' as const
};

/**
 * Resource creator for the ai-helpers skills index.
 */
const aiHelpersSkillsIndexResource = (): McpResource => [
  NAME,
  URI,
  CONFIG,
  async (passedUri: URL) => {
    const skills = await getAiHelpersSkills();

    const header = stringJoin.newline(
      '# ai-helpers Skills',
      '',
      'PatternFly coding skills served from the [ai-helpers](https://github.com/patternfly/ai-helpers) marketplace. Read any skill via `aihelpers://skills/{name}`.',
      ''
    );

    const table = stringJoin.newline(
      '| Skill | Plugin | Description |',
      '|-------|--------|-------------|',
      ...skills.map(skill => `| ${skill.name} | ${skill.plugin} | ${skill.description} |`)
    );

    return {
      contents: [
        {
          uri: passedUri?.toString(),
          mimeType: 'text/markdown',
          text: stringJoin.newline(header, table)
        }
      ]
    };
  }
];

export { aiHelpersSkillsIndexResource, NAME, URI, CONFIG };
