import { main, start, type CliOptions } from '../index';
import { parseCliOptions, freezeOptions, type GlobalOptions } from '../options';
import { runServer } from '../server';

// Mock dependencies
jest.mock('../options');
jest.mock('../server');

const mockParseCliOptions = parseCliOptions as jest.MockedFunction<typeof parseCliOptions>;
const mockFreezeOptions = freezeOptions as jest.MockedFunction<typeof freezeOptions>;
const mockRunServer = runServer as jest.MockedFunction<typeof runServer>;

describe('main', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let processExitSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock process.exit to prevent actual exit
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    // Mock console.error
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Setup default mocks
    mockParseCliOptions.mockReturnValue({ docsHost: false });
    mockFreezeOptions.mockReturnValue({} as GlobalOptions);
    mockRunServer.mockResolvedValue({
      stop: jest.fn().mockResolvedValue(undefined),
      isRunning: jest.fn().mockReturnValue(true)
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it('should attempt to freeze options with parsed CLI options', async () => {
    const cliOptions = { docsHost: true };

    mockParseCliOptions.mockReturnValue(cliOptions);

    await main();

    expect(mockFreezeOptions).toHaveBeenCalledWith(cliOptions);
  });

  it('should attempt to parse CLI options and run the server', async () => {
    await main();

    expect(mockParseCliOptions).toHaveBeenCalled();
    expect(mockRunServer).toHaveBeenCalled();
  });

  it('should handle server startup errors', async () => {
    const error = new Error('Server failed to start');

    mockRunServer.mockRejectedValue(error);

    await main();

    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to start server:', error);
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should handle parseCliOptions errors', async () => {
    const error = new Error('Failed to parse CLI options');

    mockParseCliOptions.mockImplementation(() => {
      throw error;
    });

    await main();

    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to start server:', error);
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should handle freezeOptions errors', async () => {
    const error = new Error('Failed to freeze options');

    mockFreezeOptions.mockImplementation(() => {
      throw error;
    });

    await main();

    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to start server:', error);
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('should execute steps in correct order', async () => {
    const callOrder: string[] = [];

    mockParseCliOptions.mockImplementation(() => {
      callOrder.push('parse');

      return { docsHost: false };
    });

    mockFreezeOptions.mockImplementation(() => {
      callOrder.push('freeze');

      return {} as GlobalOptions;
    });

    mockRunServer.mockImplementation(async () => {
      callOrder.push('run');

      return {
        stop: jest.fn().mockResolvedValue(undefined),
        isRunning: jest.fn().mockReturnValue(true)
      };
    });

    await main();

    expect(callOrder).toEqual(['parse', 'freeze', 'run']);
  });

  it('should merge programmatic options with CLI options', async () => {
    const cliOptions = { docsHost: false };
    const programmaticOptions = { docsHost: true };

    mockParseCliOptions.mockReturnValue(cliOptions);

    await main(programmaticOptions);

    // Should merge CLI options with programmatic options (programmatic takes precedence)
    expect(mockFreezeOptions).toHaveBeenCalledWith({ docsHost: true });
  });

  it('should work with empty programmatic options', async () => {
    const cliOptions = { docsHost: true };

    mockParseCliOptions.mockReturnValue(cliOptions);

    await main({});

    expect(mockFreezeOptions).toHaveBeenCalledWith({ docsHost: true });
  });

  it('should work with undefined programmatic options', async () => {
    const cliOptions = { docsHost: false };

    mockParseCliOptions.mockReturnValue(cliOptions);

    await main();

    expect(mockFreezeOptions).toHaveBeenCalledWith({ docsHost: false });
  });
});

describe('start alias', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let processExitSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock process.exit to prevent actual exit
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    // Mock console.error
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Setup default mocks
    mockParseCliOptions.mockReturnValue({ docsHost: false });
    mockFreezeOptions.mockReturnValue({} as GlobalOptions);
    mockRunServer.mockResolvedValue({
      stop: jest.fn().mockResolvedValue(undefined),
      isRunning: jest.fn().mockReturnValue(true)
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it('should be equivalent to main function', async () => {
    const cliOptions = { docsHost: true };

    mockParseCliOptions.mockReturnValue(cliOptions);

    await start();

    expect(mockParseCliOptions).toHaveBeenCalled();
    expect(mockFreezeOptions).toHaveBeenCalledWith(cliOptions);
    expect(mockRunServer).toHaveBeenCalled();
  });

  it('should accept programmatic options like main', async () => {
    const cliOptions = { docsHost: false };
    const programmaticOptions = { docsHost: true };

    mockParseCliOptions.mockReturnValue(cliOptions);

    await start(programmaticOptions);

    expect(mockFreezeOptions).toHaveBeenCalledWith({ docsHost: true });
  });
});

describe('type exports', () => {
  it('should export CliOptions type', () => {
    // This test ensures the type is properly exported
    // TypeScript compilation will fail if the type is not available
    const options: Partial<CliOptions> = { docsHost: true };

    expect(options).toBeDefined();
  });
});

