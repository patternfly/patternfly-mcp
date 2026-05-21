import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { type McpTool } from '../mcpSdk';
import { runServer } from '../server';
import { getOptions, setOptions } from '../options.context';
import { DEFAULT_OPTIONS } from '../options.defaults';

// Mock dependencies
jest.mock('@modelcontextprotocol/sdk/server/mcp.js');
jest.mock('@modelcontextprotocol/sdk/server/stdio.js');

const MockMcpServer = McpServer as jest.MockedClass<typeof McpServer>;
const MockStdioServerTransport = StdioServerTransport as jest.MockedClass<typeof StdioServerTransport>;

describe('setOptions', () => {
  it('should populate the experimental array when a registered option differs from default', () => {
    const experimentalOptions = new Set<any>(['pluginIsolation']);
    const options = setOptions({
      pluginIsolation: 'none',
      experimental: ['pluginIsolation']
    }, { experimentalOptions });

    expect(options.experimental).toContain('pluginIsolation');
  });

  it('should not populate the experimental array when options match defaults', () => {
    const experimentalOptions = new Set<any>(['pluginIsolation']);
    const options = setOptions({
      pluginIsolation: DEFAULT_OPTIONS.pluginIsolation,
      experimental: ['pluginIsolation']
    }, { experimentalOptions });

    expect(options.experimental).not.toContain('pluginIsolation');
  });

  it('should ignore valid but incorrect options for merged options', () => {
    const updatedOptions = setOptions({
      logging: 'oops',
      resourceMemoOptions: 'gotcha',
      toolMemoOptions: 'really?',
      pluginIsolation: 'fun'
    } as any);

    expect(updatedOptions.logging.protocol).toBe(DEFAULT_OPTIONS.logging.protocol);
    expect(updatedOptions.resourceMemoOptions?.readFile?.expire).toBe(DEFAULT_OPTIONS.resourceMemoOptions?.readFile?.expire);
    expect(updatedOptions.toolMemoOptions?.usePatternFlyDocs?.expire).toBe(DEFAULT_OPTIONS.toolMemoOptions?.usePatternFlyDocs?.expire);
    expect(updatedOptions.pluginIsolation).toBe(DEFAULT_OPTIONS.pluginIsolation);
  });

  it('should ignore null/invalid nested overrides safely', () => {
    const updatedOptions = setOptions({ logging: null, resourceMemoOptions: null, pluginIsolation: null } as any);

    expect(typeof updatedOptions.logging.protocol).toBe('boolean');
    expect(updatedOptions.logging.protocol).toBe(DEFAULT_OPTIONS.logging.protocol);

    expect(typeof updatedOptions.resourceMemoOptions?.readFile?.expire).toBe('number');
    expect(updatedOptions.resourceMemoOptions?.readFile?.expire).toBe(DEFAULT_OPTIONS.resourceMemoOptions?.readFile?.expire);

    expect(typeof updatedOptions.toolMemoOptions?.usePatternFlyDocs?.expire).toBe('number');
    expect(updatedOptions.toolMemoOptions?.usePatternFlyDocs?.expire).toBe(DEFAULT_OPTIONS.toolMemoOptions?.usePatternFlyDocs?.expire);

    expect(typeof updatedOptions.pluginIsolation).toBe('string');
    expect(updatedOptions.pluginIsolation).toBe(DEFAULT_OPTIONS.pluginIsolation);
  });
});

describe('apply context options', () => {
  it.each([
    {
      description: 'default',
      options: [{}],
      findProperty: 'name'
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
    setOptions({});
    jest.clearAllMocks();

    // Mock server instance
    mockServer = {
      registerTool: jest.fn(),
      registerResource: jest.fn(),
      connect: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined)
    };

    // Mock transport instance
    mockTransport = {};

    MockMcpServer.mockImplementation(() => mockServer);
    MockStdioServerTransport.mockImplementation(() => mockTransport);
  });

  it('should maintain equivalent option values inside tool callback', async () => {
    setOptions({ name: 'als-contract-test' });

    const tool = (options = getOptions()): McpTool => {
      const callback = async () => {
        const ctxOptions = getOptions();

        const result = {
          creator: { name: options.name },
          ctx: { name: ctxOptions.name },
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
        { description: 'Context test tool', inputSchema: z.object({}) },
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
