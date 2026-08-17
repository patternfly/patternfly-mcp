import {
  registerCollections,
  getServerRecordsRegistry,
  onUpdateServerRecordsRegistry,
  setServerRecordsRegistry
} from '../collections';

jest.mock('../logger', () => ({
  log: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  },
  formatUnknownError: jest.fn(err => String(err))
}));

describe('getServerRecordsRegistry', () => {
  beforeEach(() => {
    const registry = getServerRecordsRegistry() as Map<string, any>;

    registry.clear();

    jest.clearAllMocks();
  });

  it('returns the full registry Map when called without params', () => {
    const registry = getServerRecordsRegistry();

    expect(registry).toBeInstanceOf(Map);
    expect((registry as Map<string, unknown>).size).toBe(0);
  });
});

describe('onUpdateServerRecordsRegistry', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    const registry = getServerRecordsRegistry() as Map<string, any>;

    registry.clear();

    jest.clearAllMocks();
  });

  afterEach(() => jest.useRealTimers());

  it('should return a no-op unsubscribe when callback is not a function', () => {
    const unsubscribe = onUpdateServerRecordsRegistry(null as any);

    expect(unsubscribe()).toBe(false);
  });

  it('should not replay existing registry entries by default', async () => {
    const response = { records: [{ id: '1' }] } as any;

    await setServerRecordsRegistry({ name: 'cached', response });

    const handler = jest.fn();

    onUpdateServerRecordsRegistry(handler);

    await jest.runAllTimersAsync();

    expect(handler).not.toHaveBeenCalled();
  });

  it('replays existing registry entries when replay is enabled', async () => {
    const docs = { records: [{ id: 'docs' }] } as any;
    const schemas = { records: [{ id: 'schemas' }] } as any;

    await setServerRecordsRegistry({ name: 'patternfly-docs', response: docs });
    await setServerRecordsRegistry({ name: 'patternfly-component-schemas', response: schemas });

    const handler = jest.fn();

    onUpdateServerRecordsRegistry(handler, { replay: true });

    await jest.runAllTimersAsync();

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenCalledWith({
      name: 'patternfly-docs',
      response: docs,
      error: undefined
    });
    expect(handler).toHaveBeenCalledWith({
      name: 'patternfly-component-schemas',
      response: schemas,
      error: undefined
    });
  });

  it('should attempt to fire the callback again after replay on a subsequent update', async () => {
    const response = { records: [{ id: '1' }] } as any;

    await setServerRecordsRegistry({ name: 'repeatable', response });

    const handler = jest.fn();

    onUpdateServerRecordsRegistry(handler, { replay: true });

    await jest.runAllTimersAsync();

    expect(handler).toHaveBeenCalledTimes(1);

    await setServerRecordsRegistry({ name: 'repeatable', response });

    expect(handler).toHaveBeenCalledTimes(2);
  });
});

describe('get, set, update the server records registry', () => {
  beforeEach(() => {
    const registry = getServerRecordsRegistry() as Map<string, any>;

    registry.clear();

    jest.clearAllMocks();
  });

  it('should return a specific collection by name when available', async () => {
    const response = { records: [{ id: '1', sourceId: 's', sourceType: 'local' }] } as any;

    await setServerRecordsRegistry({ name: 'hello', response });

    expect(getServerRecordsRegistry({ collectionName: 'hello' })).toEqual(response);
    expect(getServerRecordsRegistry({ collectionName: 'world' })).toBeUndefined();
  });

  it('should register and unregister listeners correctly', async () => {
    const handler = jest.fn();
    const unsubscribe = onUpdateServerRecordsRegistry(handler);

    await setServerRecordsRegistry({ name: 'ipsum', response: { records: [] } as any });

    expect(handler).toHaveBeenCalledWith({ name: 'ipsum', response: { records: [] }, error: undefined });

    expect(unsubscribe()).toBe(true);
    expect(unsubscribe()).toBe(false);

    await setServerRecordsRegistry({ name: 'ipsum', response: { records: [] } as any });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should continue processing when a listener throws', async () => {
    const faulty = jest.fn().mockRejectedValue(new Error('lorem ipsum'));
    const good = jest.fn();

    onUpdateServerRecordsRegistry(faulty);
    onUpdateServerRecordsRegistry(good);

    await setServerRecordsRegistry({ name: 'sit', response: { records: [] } as any });
    expect(good).toHaveBeenCalled();
  });

  it('should store records when name and response are provided', async () => {
    await setServerRecordsRegistry({ name: 'lorem-ipsum', response: { records: [{ id: 'x' }] } as any });

    const stored = getServerRecordsRegistry({ collectionName: 'lorem-ipsum' });

    expect(stored).toEqual({ records: [{ id: 'x' }] });
  });

  it('should not store or notify when response is missing', async () => {
    const listener = jest.fn();

    onUpdateServerRecordsRegistry(listener);

    await setServerRecordsRegistry({ name: 'dolor' });

    expect(getServerRecordsRegistry({ collectionName: 'dolor' })).toBeUndefined();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('registerCollections', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should register valid collections and call onUpdate', async () => {
    jest.useFakeTimers();
    const onUpdate = jest.fn();
    const handler = jest.fn().mockResolvedValue({ records: [] });
    const collections: any[] = [
      ['test-collection', handler]
    ];

    await registerCollections(collections, { onUpdate });
    await jest.runAllTimersAsync();

    expect(handler).toHaveBeenCalled();
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      name: 'test-collection',
      response: { records: [] }
    }));

    jest.useRealTimers();
  });

  it('should handle isRequired and throw if it fails', async () => {
    const handler = jest.fn().mockRejectedValue(new Error('Failed'));
    const collections: any[] = [
      ['lorem-collection', handler, { isRequired: true }]
    ];

    await expect(registerCollections(collections)).rejects.toThrow('Required collection lorem-collection failed to load.');
  });

  it('should not throw if optional collection fails during initial gatekeep', async () => {
    const handler = jest.fn().mockRejectedValue(new Error('Failed'));
    const collections: any[] = [
      ['dolor-collection', handler, { isRequired: false }]
    ];

    await expect(registerCollections(collections)).resolves.not.toThrow();
  });

  it('should call onRequired when all required collections are settled', async () => {
    const onRequired = jest.fn();
    const handler = jest.fn().mockResolvedValue({ records: [{ id: '1' }] });
    const collections: any[] = [
      ['req', handler, { isRequired: true }]
    ];

    await registerCollections(collections, { onRequired });

    expect(onRequired).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'req', response: { records: [{ id: '1' }] } })
    ]);
  });

  it('should call onSettle with all results (fulfilled and rejected)', async () => {
    let settlePromiseResolve: (value: any) => void;
    const settlePromise = new Promise(resolve => {
      settlePromiseResolve = resolve;
    });

    const onSettle = jest.fn(results => settlePromiseResolve(results));

    const handler1 = jest.fn().mockResolvedValue({ records: [{ id: '1' }] });
    const handler2 = jest.fn().mockRejectedValue(new Error('Fail'));

    const collections: any[] = [
      ['c1', handler1],
      ['c2', handler2]
    ];

    await registerCollections(collections, { onSettle });
    const results: any = await settlePromise;

    expect(results).toMatchSnapshot();
    expect(results.fulfilled).toContainEqual({ records: [{ id: '1' }] });
    expect(results.rejected).toContainEqual(expect.objectContaining({ name: 'c2' }));
  });

  it('should follow the options pattern by allowing creators to use mocked options', async () => {
    const mockOptions = { custom: 'value' };
    const handler = jest.fn().mockResolvedValue({ records: [] });
    const creator = (opt: unknown): any => ['opt-collection', () => handler(opt)];
    const collection = creator(mockOptions);

    await registerCollections([collection]);

    expect(handler).toHaveBeenCalledWith(mockOptions);
  });
});
