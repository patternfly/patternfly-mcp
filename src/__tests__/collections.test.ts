import {
  registerCollections,
  getServerCollectionsRegistry,
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

describe('getServerCollectionsRegistry', () => {
  beforeEach(() => {
    const registry = getServerCollectionsRegistry() as Map<string, any>;

    registry.clear();

    jest.clearAllMocks();
  });

  it('should return the full registry Map when called without params', () => {
    const registry = getServerCollectionsRegistry();

    expect(registry).toBeInstanceOf(Map);
    expect((registry as Map<string, unknown>).size).toBe(0);
  });

  it('should return a specific collection when called with a collection name', async () => {
    await setServerRecordsRegistry({
      name: 'hello',
      config: { title: 'Hello' },
      response: { records: [] } as any
    });

    expect(getServerCollectionsRegistry({ collectionName: 'hello' })).toEqual({
      response: { records: [] },
      config: { title: 'Hello' }
    });
  });
});

describe('onUpdateServerRecordsRegistry', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    const registry = getServerCollectionsRegistry() as Map<string, any>;

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

  it('should replay existing registry entries when enabled', async () => {
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
      config: undefined,
      response: docs,
      error: undefined
    });
    expect(handler).toHaveBeenCalledWith({
      name: 'patternfly-component-schemas',
      config: undefined,
      response: schemas,
      error: undefined
    });
  });

  it('should replay configuration when enabled', async () => {
    const docs = { records: [{ id: 'docs' }] } as any;

    await setServerRecordsRegistry({
      name: 'patternfly-docs',
      config: { title: 'PatternFly Docs' },
      response: docs
    });

    const handler = jest.fn();

    onUpdateServerRecordsRegistry(handler, { replay: true });

    await jest.runAllTimersAsync();

    expect(handler).toHaveBeenCalledWith({
      name: 'patternfly-docs',
      config: { title: 'PatternFly Docs' },
      response: docs,
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
    const registry = getServerCollectionsRegistry() as Map<string, any>;

    registry.clear();

    jest.clearAllMocks();
  });

  it('should return a specific collection by name when available', async () => {
    const response = { records: [{ id: '1', sourceId: 's', sourceType: 'local' }] } as any;

    await setServerRecordsRegistry({ name: 'hello', response });

    expect(getServerCollectionsRegistry({ collectionName: 'hello' }))
      .toEqual(expect.objectContaining({ response }));

    expect(getServerCollectionsRegistry({ collectionName: 'world' })).toBeUndefined();
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

    expect(getServerCollectionsRegistry({ collectionName: 'lorem-ipsum' }))
      .toEqual(expect.objectContaining({ response: { records: [{ id: 'x' }] } }));
  });

  it('should store plugin-visible config when provided with records', async () => {
    await setServerRecordsRegistry({
      name: 'meta-collection',
      config: { title: 'My Collection' },
      response: { records: [] } as any
    });

    expect(getServerCollectionsRegistry({ collectionName: 'meta-collection' }))
      .toEqual(expect.objectContaining({ response: { records: [] } }));
  });

  it('should register metadata by name without notifying when response is not yet available', async () => {
    const listener = jest.fn();

    onUpdateServerRecordsRegistry(listener);

    await setServerRecordsRegistry({ name: 'dolor', config: { title: 'Dolor' } });

    expect((getServerCollectionsRegistry({ collectionName: 'dolor' }) as any)?.response).toBeUndefined();
    expect(getServerCollectionsRegistry({ collectionName: 'dolor' }))
      .toEqual(expect.objectContaining({ config: { title: 'Dolor' } }));
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
      ['test-collection', undefined, handler]
    ];

    await registerCollections(collections, { onUpdate });
    await jest.runAllTimersAsync();

    expect(handler).toHaveBeenCalled();
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      name: 'test-collection',
      config: undefined,
      response: { records: [] }
    }));

    jest.useRealTimers();
  });

  it('should handle isRequired and throw if it fails', async () => {
    const handler = jest.fn().mockRejectedValue(new Error('Failed'));
    const collections: any[] = [
      ['lorem-collection', undefined, handler, { isRequired: true }]
    ];

    await expect(registerCollections(collections)).rejects.toThrow('Required collection lorem-collection failed to load.');
  });

  it('should not throw if optional collection fails during initial gatekeep', async () => {
    const handler = jest.fn().mockRejectedValue(new Error('Failed'));
    const collections: any[] = [
      ['dolor-collection', undefined, handler, { isRequired: false }]
    ];

    await expect(registerCollections(collections)).resolves.not.toThrow();
  });

  it('should immediately hydrate serverRecordsRegistry when config.initial is provided', async () => {
    const initialRecords = [{ id: 'init-1', sourceId: 'local', sourceType: 'api' }] as any;
    let resolveHandler: (res: any) => void;
    const asyncPromise = new Promise(resolve => {
      resolveHandler = resolve as (res: any) => void;
    });
    const handler = jest.fn().mockImplementation(() => asyncPromise);

    const collections: any[] = [
      ['dual-phase-collection', {}, handler, { initial: { records: initialRecords } }]
    ];

    const registrationPromise = registerCollections(collections);

    // Immediate check: serverRecordsRegistry has initial records before handler finishes
    expect(getServerCollectionsRegistry({ collectionName: 'dual-phase-collection' }))
      .toEqual(expect.objectContaining({ response: { records: initialRecords } }));

    resolveHandler!({ records: [{ id: 'live-1', sourceId: 'live', sourceType: 'api' }] });
    await registrationPromise;
  });

  it('should retain previous viable records when retainLastViable is true and update returns empty records', async () => {
    const initialRecords = [{ id: 'init-1', sourceId: 'local', sourceType: 'api' }] as any;
    const handler = jest.fn().mockResolvedValue({ records: [] });

    const collections: any[] = [
      ['retained-collection', {}, handler, { initial: { records: initialRecords }, retainLastViable: true }]
    ];

    await registerCollections(collections);

    // Retains initialRecords because update returned empty records
    expect(getServerCollectionsRegistry({ collectionName: 'retained-collection' }))
      .toEqual(expect.objectContaining({ response: { records: initialRecords } }));
  });

  it('should retain previous viable records when retainLastViable is true and update throws an error', async () => {
    const initialRecords = [{ id: 'init-1', sourceId: 'local', sourceType: 'api' }] as any;
    const handler = jest.fn().mockRejectedValue(new Error('Network failure'));

    const collections: any[] = [
      ['error-retained-collection', {}, handler, { initial: { records: initialRecords }, retainLastViable: true }]
    ];

    await registerCollections(collections);

    // Retains initialRecords because update threw an error
    expect(getServerCollectionsRegistry({ collectionName: 'error-retained-collection' }))
      .toEqual(expect.objectContaining({ response: { records: initialRecords } }));
  });

  it('should support a custom function for retainLastViable', async () => {
    const initialRecords = [
      { id: 'init-1', sourceId: 'mock', sourceType: 'mock' },
      { id: 'init-2', sourceId: 'mock', sourceType: 'mock' },
      { id: 'init-3', sourceId: 'mock', sourceType: 'mock' }
    ];
    // Crawl returned only 1 record
    const handler = jest.fn().mockResolvedValue({ records: [{ id: 'init-1', sourceId: 'mock', sourceType: 'mock' }] });
    const customPredicate = jest.fn().mockImplementation(({ previous, current }) => {
      const prevCount = previous?.records?.length || 0;
      const newCount = current?.records?.length || 0;

      return newCount < prevCount * 0.5;
    });

    const collections: any[] = [
      ['custom-func-collection', {}, handler, {
        initial: { records: initialRecords },
        retainLastViable: customPredicate
      }]
    ];

    await registerCollections(collections);

    expect(customPredicate).toHaveBeenCalledWith(expect.objectContaining({
      name: 'custom-func-collection',
      previous: { records: initialRecords },
      current: { records: [{ id: 'init-1', sourceId: 'mock', sourceType: 'mock' }] },
      isSuccess: true
    }));

    expect(getServerCollectionsRegistry({ collectionName: 'custom-func-collection' }))
      .toEqual(expect.objectContaining({ response: { records: initialRecords } }));
  });

  it('should not write invalid collections to the registry', async () => {
    const handler = jest.fn().mockResolvedValue({ records: [{ id: 'invalid-record' }] });

    await registerCollections([['invalid-collection', {}, handler]]);

    expect((getServerCollectionsRegistry({ collectionName: 'invalid-collection' }) as any)?.response).toBeUndefined();
    expect(getServerCollectionsRegistry({ collectionName: 'invalid-collection' }))
      .toEqual(expect.objectContaining({ config: {} }));
  });

  it('should register optional collections by name when tuple config is undefined', async () => {
    let resolveHandler: (value: { records: [] }) => void;
    const asyncPromise = new Promise<{ records: [] }>(resolve => {
      resolveHandler = resolve;
    });
    const handler = jest.fn().mockImplementation(() => asyncPromise);

    const registrationPromise = registerCollections([
      ['undefined-config-collection', undefined, handler]
    ]);

    expect((getServerCollectionsRegistry({ collectionName: 'undefined-config-collection' }) as any)?.response).toBeUndefined();
    expect(getServerCollectionsRegistry({ collectionName: 'undefined-config-collection' })).toEqual({});

    resolveHandler!({ records: [] });
    await registrationPromise;

    expect(getServerCollectionsRegistry({ collectionName: 'undefined-config-collection' }))
      .toEqual(expect.objectContaining({ response: { records: [] } }));
  });

  it('should register optional collections by name before the handler resolves', async () => {
    let resolveHandler: (value: { records: [] }) => void;
    const asyncPromise = new Promise<{ records: [] }>(resolve => {
      resolveHandler = resolve;
    });
    const handler = jest.fn().mockImplementation(() => asyncPromise);

    const registrationPromise = registerCollections([
      ['delayed-collection', { title: 'Delayed' }, handler]
    ]);

    expect((getServerCollectionsRegistry({ collectionName: 'delayed-collection' }) as any)?.response).toBeUndefined();
    expect(getServerCollectionsRegistry({ collectionName: 'delayed-collection' }))
      .toEqual(expect.objectContaining({ config: { title: 'Delayed' } }));

    resolveHandler!({ records: [] });
    await registrationPromise;

    expect(getServerCollectionsRegistry({ collectionName: 'delayed-collection' }))
      .toEqual(expect.objectContaining({ response: { records: [] } }));
  });

  it('should call onRequired when all required collections are settled', async () => {
    const onRequired = jest.fn();
    const handler = jest.fn().mockResolvedValue({ records: [{ id: '1', sourceId: 'mock', sourceType: 'mock' }] });
    const collections: any[] = [
      ['req', {}, handler, { isRequired: true }]
    ];

    await registerCollections(collections, { onRequired });

    expect(onRequired).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'req',
        config: {},
        response: { records: [{ id: '1', sourceId: 'mock', sourceType: 'mock' }] }
      })
    ]);
  });

  it('should pass configuration to registry listeners and onUpdate', async () => {
    jest.useFakeTimers();
    const onUpdate = jest.fn();
    const handler = jest.fn().mockResolvedValue({ records: [] });

    await registerCollections([
      ['meta-collection', { title: 'My Collection' }, handler]
    ], { onUpdate });
    await jest.runAllTimersAsync();

    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      name: 'meta-collection',
      config: { title: 'My Collection' }
    }));

    jest.useRealTimers();
  });

  it('should call onSettle with all results, fulfilled and rejected', async () => {
    let settlePromiseResolve: (value: any) => void;
    const settlePromise = new Promise(resolve => {
      settlePromiseResolve = resolve;
    });

    const onSettle = jest.fn(results => settlePromiseResolve(results));

    const handler1 = jest.fn().mockResolvedValue({ records: [{ id: '1', sourceId: 'mock', sourceType: 'mock' }] });
    const handler2 = jest.fn().mockRejectedValue(new Error('Fail'));

    const collections: any[] = [
      ['c1', {}, handler1],
      ['c2', {}, handler2]
    ];

    await registerCollections(collections, { onSettle });
    const results: any = await settlePromise;

    expect(results).toMatchSnapshot();

    expect(results.fulfilled).toContainEqual({ records: [{ id: '1', sourceId: 'mock', sourceType: 'mock' }] });
    expect(results.rejected).toContainEqual(expect.objectContaining({ name: 'c2' }));
  });

  it('should follow the options pattern by allowing creators to use mocked options', async () => {
    const mockOptions = { custom: 'value' };
    const handler = jest.fn().mockResolvedValue({ records: [] });
    const creator = (opt: unknown): any => ['opt-collection', {}, () => handler(opt)];
    const collection = creator(mockOptions);

    await registerCollections([collection]);

    expect(handler).toHaveBeenCalledWith(mockOptions);
  });
});
