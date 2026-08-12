import { getOptions, getSessionOptions } from '../options.context';
import { composeCollections } from '../server.collections';
import { getHeavyPool } from '../server.workerPool';

jest.mock('../options.context', () => ({
  getOptions: jest.fn(),
  getSessionOptions: jest.fn()
}));

jest.mock('../server.workerPool', () => ({
  getHeavyPool: jest.fn()
}));

describe('composeCollections', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should wrap builtin creators and set _isInternal: true', async () => {
    const mockHandler = jest.fn();
    const mockCreator: any = jest.fn(() => ['test-collection', mockHandler, { isRequired: true }]);

    const builtinCreators = [mockCreator];
    const result: any = await composeCollections(builtinCreators);

    expect(result.length).toBe(1);

    const [name, callback, config] = result[0]({});

    expect(name).toBe('test-collection');
    expect(config?._isInternal).toBe(true);
    expect(config?.isRequired).toBe(true);
    expect(callback).toBe(mockHandler);
  });

  it('should proxy creators that declare parallel execution via runParallel with hash prefix', async () => {
    const mockHandler = jest.fn();
    const mockCreator: any = jest.fn(() => [
      'parallel-collection',
      mockHandler,
      { runParallel: '#collectionLoremIpsum' }
    ]);

    (getOptions as jest.Mock).mockReturnValue({ serverName: 'mcp' });
    (getSessionOptions as jest.Mock).mockReturnValue({ sessionId: 'session-id' });

    const heavyPool = { runTask: jest.fn().mockResolvedValue({ records: [] }) };

    (getHeavyPool as jest.Mock).mockReturnValue(heavyPool);

    const result: any = await composeCollections([mockCreator]);

    expect(result.length).toBe(1);

    const [name, handler, config] = result[0]();

    expect(name).toBe('parallel-collection');
    expect(config?._isInternal).toBe(true);
    expect(config?.runParallel).toBe('#collectionLoremIpsum');

    const executionResult = await handler({ inputArg: 'test' });

    expect(executionResult).toEqual({ records: [] });

    expect(heavyPool.runTask).toHaveBeenCalledWith({
      moduleSpecifier: '#collectionLoremIpsum',
      exportName: 'collectionCallback',
      args: { inputArg: 'test' },
      options: expect.any(Object),
      session: { sessionId: 'session-id' }
    });
  });

  it('should return an empty array when no creators are provided', async () => {
    const result = await composeCollections([]);

    expect(result).toEqual([]);
  });

  it('should wrap creators that declare runSchedule with a deferred task', async () => {
    const mockHandler = jest.fn().mockResolvedValue({ records: [{ id: 'row-1' }] });
    const mockCreator: any = jest.fn(() => [
      'scheduled-collection',
      mockHandler,
      { runSchedule: { cancelMs: 100, intervalMs: 50 } }
    ]);

    const result: any = await composeCollections([mockCreator]);

    expect(result.length).toBe(1);

    const [name, handler, config] = result[0]();

    expect(name).toBe('scheduled-collection');
    expect(config?._isInternal).toBe(true);
    expect(handler).not.toBe(mockHandler);

    const executionResult = await handler({ inputArg: 'test' });

    expect(mockHandler).toHaveBeenCalledWith({ inputArg: 'test' });
    expect(executionResult).toEqual({ records: [{ id: 'row-1' }] });
  });

  it('should fall back to an empty records result when the deferred task yields undefined', async () => {
    const mockHandler = jest.fn().mockResolvedValue(undefined);
    const mockCreator: any = jest.fn(() => [
      'scheduled-empty-collection',
      mockHandler,
      { runSchedule: { cancelMs: 100, intervalMs: 50 } }
    ]);

    const result: any = await composeCollections([mockCreator]);
    const [, handler] = result[0]();
    const executionResult = await handler();

    expect(executionResult).toEqual({ records: [] });
  });

  it.each([
    {
      description: 'with custom options',
      options: { some: 'option' },
      session: { sessionId: '123' }
    }
  ])('should handle various configurations, $description', async ({ options, session }) => {
    (getOptions as jest.Mock).mockReturnValue(options);
    (getSessionOptions as jest.Mock).mockReturnValue(session);

    const mockCreator: any = jest.fn(() => ['test', jest.fn()]);
    const result: any = await composeCollections([mockCreator], options as any, session as any);

    expect(result.length).toBe(1);
    expect(result[0]()).toContain('test');
  });

  it('should match snapshot for composed collection creators', async () => {
    const mockCreator: any = jest.fn(() => ['snap-collection', jest.fn(), { isRequired: false }]);
    const result: any = await composeCollections([mockCreator]);

    const output = result.map((collection: any) => {
      const [name, , config] = collection();

      return { name, config };
    });

    expect(output).toMatchSnapshot();
  });
});
