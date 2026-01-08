import { main, start, type PfMcpOptions, type CliOptions } from '../index';
import { parseCliOptions, type GlobalOptions } from '../options';
import { DEFAULT_OPTIONS } from '../options.defaults';
import { getSessionOptions, runWithSession, setOptions } from '../options.context';
import { runServer } from '../server';

// Mock dependencies
jest.mock('../options');
jest.mock('../options.context');
jest.mock('../server');
jest.mock('../server.tools');

const mockParseCliOptions = parseCliOptions as jest.MockedFunction<typeof parseCliOptions>;
const mockSetOptions = setOptions as jest.MockedFunction<typeof setOptions>;
const mockRunServer = runServer as jest.MockedFunction<typeof runServer>;
const mockGetSessionOptions = getSessionOptions as jest.MockedFunction<typeof getSessionOptions>;
const mockRunWithSession = runWithSession as jest.MockedFunction<typeof runWithSession>;

describe('main', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let processExitSpy: jest.SpyInstance;
  let callOrder: string[] = [];
  const defaultLogging = { level: 'info' as const, stderr: false, protocol: false };

  beforeEach(() => {
    jest.clearAllMocks();
    callOrder = [];

    // Mock process.exit to prevent actual exit
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    // Mock console.error
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Setup default mocks
    mockParseCliOptions.mockImplementation(() => {
      callOrder.push('parse');

      return { docsHost: false, logging: defaultLogging } as CliOptions;
    });

    mockSetOptions.mockImplementation(options => {
      callOrder.push('set');

      return Object.freeze({ ...DEFAULT_OPTIONS, ...options }) as GlobalOptions;
    });

    mockGetSessionOptions.mockReturnValue({
      sessionId: 'test-session-id',
      channelName: 'patternfly-mcp:test-session-id'
    } as any);

    mockRunWithSession.mockImplementation(async (_session, callback: any) => await callback());

    const mockServerInstance = {
      stop: jest.fn().mockResolvedValue(undefined),
      isRunning: jest.fn().mockReturnValue(true),
      getStats: jest.fn().mockReturnValue({}),
      onLog: jest.fn()
    };

    mockRunServer.mockImplementation(async () => {
      callOrder.push('run');

      return mockServerInstance;
    });

    // Also mock runServer.memo since index.ts uses runServer.memo
    (mockRunServer as any).memo = mockRunServer;
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it('should handle server startup errors', async () => {
    const error = new Error('Server failed to start');

    mockRunServer.mockRejectedValue(error);

    await main();

    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to start server:', error);
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it.each([
    {
      description: 'parseCliOptions',
      error: new Error('Failed to parse CLI options'),
      message: 'Failed to start server:',
      method: main
    },
    {
      description: 'setOptions',
      error: new Error('Failed to set options'),
      message: 'Failed to start server:',
      method: main
    },
    {
      description: 'parseCliOptions, with start alias',
      error: new Error('Failed to parse CLI options'),
      message: 'Failed to start server:',
      method: start
    },
    {
      description: 'setOptions, with start alias',
      error: new Error('Failed to set options'),
      message: 'Failed to start server:',
      method: start
    }
  ])('should handle errors, $description', async ({ error, message, method }) => {
    mockSetOptions.mockImplementation(() => {
      throw error;
    });

    await method();

    expect(consoleErrorSpy).toHaveBeenCalledWith(message, error);
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it.each([
    {
      description: 'merge programmatic options with CLI options',
      programmaticOptions: { docsHost: true },
      cliOptions: { docsHost: false },
      method: main
    },
    {
      description: 'with empty programmatic options',
      programmaticOptions: {},
      cliOptions: { docsHost: true },
      method: main
    },
    {
      description: 'with undefined programmatic options',
      programmaticOptions: undefined,
      cliOptions: { docsHost: false },
      method: main
    },
    {
      description: 'merge programmatic options with CLI options, with start alias',
      programmaticOptions: { docsHost: true },
      cliOptions: { docsHost: false },
      method: start
    }
  ])('should merge default, cli and programmatic options, $description', async ({ programmaticOptions, cliOptions, method }) => {
    mockParseCliOptions.mockImplementation(() => {
      callOrder.push('parse');

      return { ...(cliOptions as any), logging: defaultLogging } as unknown as CliOptions;
    });

    await method(programmaticOptions as any);

    expect({
      methodRegistersAs: method.name,
      sequence: callOrder,
      calls: mockSetOptions.mock.calls
    }).toMatchSnapshot();
  });
});

describe('type exports', () => {
  it('should export PfMcpOptions type', () => {
    // TypeScript compilation will fail if the type is unavailable
    const options: PfMcpOptions = { docsHost: true };

    expect(options).toBeDefined();
  });
});

