import { main } from '../index';
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
    mockRunServer.mockResolvedValue(undefined);
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
    });

    await main();

    expect(callOrder).toEqual(['parse', 'freeze', 'run']);
  });
});

