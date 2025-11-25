import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { runServer, type McpTool } from '../server';
import { getOptions, setOptions } from '../options.context';

// Mock dependencies
jest.mock('@modelcontextprotocol/sdk/server/mcp.js');
jest.mock('@modelcontextprotocol/sdk/server/stdio.js');
jest.mock('../utils.moduleResolver'); // Mock the module resolver to avoid import.meta issues

const MockMcpServer = McpServer as jest.MockedClass<typeof McpServer>;
const MockStdioServerTransport = StdioServerTransport as jest.MockedClass<typeof StdioServerTransport>;

describe('apply context options', () => {
  it.each([
    {
      description: 'default',
      options: [{ docsHost: true }],
      findProperty: 'docsHost'
    },
    {
      description: 'confirm by applying a potential property outside of typings',
      options: [{ lorem: 'ipsum' }],
      findProperty: 'lorem'
    },
    {
      description: 'multiple property updates',
      options: [{ name: 'ipsum' }, { name: 'dolor sit amet' }, { name: 'consectetur adipiscing elit' }],
      findProperty: 'name'
    }
  ])('should set and get basic options, $description', ({ options, findProperty }) => {
    options.forEach(opts => {
      const setOpts = setOptions(opts as any);
      const getOpts = getOptions();

      expect(Object.isFrozen(setOpts)).toBe(true);
      expect(Object.isFrozen(getOpts)).toBe(true);
      expect(setOpts).toEqual(getOpts);

      expect(`${findProperty} = ${(getOpts as any)[findProperty as any]}`).toMatchSnapshot();
    });
  });
});

describe('tool creator options context', () => {
  let mockServer: any;
  let mockTransport: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock server instance
    mockServer = {
      registerTool: jest.fn(),
      connect: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined)
    };

    // Mock transport instance
    mockTransport = {};

    MockMcpServer.mockImplementation(() => mockServer);
    MockStdioServerTransport.mockImplementation(() => mockTransport);
  });

  it('should maintain equivalent option values inside tool callback', async () => {
    setOptions({ name: 'als-contract-test', docsHost: true });

    const tool = (options = getOptions()): McpTool => {
      const callback = async () => {
        const ctxOptions = getOptions();

        const result = {
          creator: { name: options.name, docsHost: options.docsHost },
          ctx: { name: ctxOptions.name, docsHost: ctxOptions.docsHost },
          isSameReference: Object.is(options, ctxOptions)
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result)
            }
          ]
        };
      };

      return [
        'alsContract',
        { description: 'Context test tool', inputSchema: {} },
        callback
      ];
    };

    await runServer(undefined, { tools: [tool], enableSigint: false });

    // Extract the registered callback wrapper (which applies runWithOptions)
    expect(mockServer.registerTool).toHaveBeenCalledTimes(1);
    const [[_name, _schema, registeredCallback]] = mockServer.registerTool.mock.calls as any[];

    const response = await registeredCallback({});
    const payload = JSON.parse(response?.content?.[0]?.text || '{}');

    // Deep equality on selected properties and confirm references are unique
    expect(payload.creator).toEqual(payload.ctx);
    expect(payload.isSameReference).toBe(false);
  });
});
