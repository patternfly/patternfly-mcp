import { usePatternFlyDocsTool } from '../tool.patternFlyDocs';
import { searchPatternFlyTool } from '../tool.searchPatternFly';
import { searchPatternFlyDocsTool } from '../tool.searchPatternFlyDocs';

describe('tool registration with --client mode', () => {
  it.each([
    {
      tool: 'searchPatternFly',
      getTool: searchPatternFlyTool,
      client: true,
      contextManagement: false,
      expected: true
    },
    {
      tool: 'searchPatternFly',
      getTool: searchPatternFlyTool,
      client: false,
      contextManagement: true,
      expected: true
    },
    {
      tool: 'searchPatternFly',
      getTool: searchPatternFlyTool,
      client: false,
      contextManagement: false,
      expected: false
    },
    {
      tool: 'searchPatternFlyDocs',
      getTool: searchPatternFlyDocsTool,
      client: true,
      contextManagement: false,
      expected: false
    },
    {
      tool: 'usePatternFlyDocs',
      getTool: usePatternFlyDocsTool,
      client: true,
      contextManagement: false,
      expected: false
    },
    {
      tool: 'searchPatternFlyDocs',
      getTool: searchPatternFlyDocsTool,
      client: false,
      contextManagement: false,
      expected: true
    }
  ])('$tool shouldRegister is $expected when client=$client', ({ getTool, client, contextManagement, expected }) => {
    const [, , , config] = getTool();
    const shouldRegister = config?.shouldRegister;

    expect(shouldRegister).toBeDefined();
    expect(shouldRegister?.({ client, contextManagement } as any)).toBe(expected);
  });
});
