import { z } from 'zod';
import { type McpTool } from './server';
import { getOptions } from './options.context';
import { getAiHelpersSkills, getAiHelpersSkillContent } from './aiHelpers.skills';
import { stringJoin } from './server.helpers';

/**
 * useAiHelpersSkill tool function.
 *
 * @param options
 * @returns MCP tool tuple [name, schema, callback]
 */
const useAiHelpersSkillTool = (options = getOptions()): McpTool => {
  const callback = async (args: any = {}) => {
    const { name } = args;

    if (!name) {
      const skills = await getAiHelpersSkills();
      const text = stringJoin.newline(
        '# ai-helpers Skills',
        '',
        `${skills.length} skills available. Pass a skill name to retrieve its full content.`,
        '',
        '| Skill | Plugin | Description |',
        '|-------|--------|-------------|',
        ...skills.map(skill => `| ${skill.name} | ${skill.plugin} | ${skill.description} |`)
      );

      return { content: [{ type: 'text', text }] };
    }

    const content = await getAiHelpersSkillContent(name);

    if (!content) {
      const skills = await getAiHelpersSkills();
      const suggestions = skills
        .filter(skill => skill.name.toLowerCase().includes(name.toLowerCase()))
        .map(skill => skill.name);
      const text = suggestions.length
        ? `Skill "${name}" not found. Did you mean: ${suggestions.join(', ')}?`
        : `Skill "${name}" not found. Use this tool without a name to list all available skills.`;

      return { content: [{ type: 'text', text }] };
    }

    return { content: [{ type: 'text', text: content }] };
  };

  return [
    'useAiHelpersSkill',
    {
      description: 'Look up coding skills for PatternFly React development, testing, accessibility, and design foundations. Call without arguments to list all available skills, or pass a skill name to get full instructions.',
      inputSchema: {
        name: z.string()
          .max(options.minMax.inputStrings.max)
          .optional()
          .describe('Skill name to retrieve (e.g. "pf-unit-test-generator"). Omit to list all skills.')
      }
    },
    callback
  ];
};

/**
 * A tool name, typically the first entry in the tuple. Used in logging and deduplication.
 */
useAiHelpersSkillTool.toolName = 'useAiHelpersSkill';

export { useAiHelpersSkillTool };
