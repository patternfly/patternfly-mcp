import { memo, memoUnwrapAdapter, normalizeMemoCache } from '../server.caching';

describe('memo', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([
    {
      description: 'default',
      options: {},
      params: [[], [], [1], [1], [2], [2], [3], [3], [1]]
    },
    {
      description: 'cacheLimit',
      options: { cacheLimit: 2 },
      params: [[], [], [1], [1], [2], [2], [3], [3], [1]]
    },
    {
      description: 'errors cached',
      options: { cacheLimit: 3, cacheErrors: true },
      params: [[7, true], [7, true], [8], [8], [9, true], [9, true], [7, true], [10]]
    },
    {
      description: 'errors NOT cached',
      options: { cacheLimit: 3, cacheErrors: false },
      params: [[7, true], [7, true], [8], [8], [9, true], [9, true], [7, true], [10]]
    },
    {
      description: 'disable memoization when cacheLimit is zero',
      options: { cacheLimit: 0 },
      params: [[], [], [1], [1], [2, true], [2, true]]
    },
    {
      description: 'allow custom key hashing',
      options: {
        keyHash: (value: unknown) => `custom-hash-${value}`
      },
      params: [[], [], [1], [1], [2, true], [2, true]]
    }
  ])('should memoize a function, $description', async ({ options, params }) => {
    const log: any[] = [];
    const logAsync: any[] = [];
    const debug = (response: any) => log.push(response);
    const debugAsync = (response: any) => logAsync.push(response);
    const updateLog = async (aLog: any) => {
      const updatedLog = [];

      for (const { type, value, cache } of aLog) {
        let successValue;
        let errorValue;

        try {
          successValue = await value();
        } catch (err) {
          const error = err as Error;

          errorValue = error.message;
        }

        successValue = successValue?.split?.('-')[1];
        errorValue = errorValue?.split?.('-')[1];

        updatedLog.push({
          type,
          successValue,
          errorValue,
          cacheKeys: [...cache.keys()],
          cacheLength: cache.size
        });
      }

      return updatedLog;
    };

    const memoized = memo(
      (str, isError = false) => {
        const arr = ['lorem', 'ipsum', 'dolor', 'sit'];
        const randomStr = Math.floor(Math.random() * arr.length);
        const genStr = `${arr[randomStr]}-${str || '[EMPTY]'}`;

        if (isError) {
          throw new Error(genStr);
        }

        return genStr;
      },
      { debug, ...options }
    );

    const memoizedAsync = memo(
      async (str, isError = false) => {
        const arr = ['lorem', 'ipsum', 'dolor', 'sit'];
        const randomStr = Math.floor(Math.random() * arr.length);
        const genStr = `${arr[randomStr]}-${str || '[EMPTY]'}`;

        if (isError) {
          throw new Error(genStr);
        }

        return genStr;
      },
      { debug: debugAsync, ...options }
    );

    for (const param of params) {
      try {
        memoized(...param as [unknown]);
      } catch {}
    }

    for (const param of params) {
      try {
        await memoizedAsync(...param as [unknown]);
      } catch {}
    }

    await expect(updateLog(log)).resolves.toMatchSnapshot('sync');
    await expect(updateLog(logAsync)).resolves.toMatchSnapshot('async');
  });

  it.each([
    {
      description: 'default with cacheErrors',
      options: { expire: 10, cacheErrors: true },
      params: [[1], [1], [2, true], [2, true], [3], [3]],
      pause: 70
    },
    {
      description: 'default with cacheErrors, error last',
      options: { expire: 10, cacheErrors: true },
      params: [[1], [1], [2, true], [2, true]],
      pause: 70
    },
    {
      description: 'default with NO cacheErrors',
      options: { expire: 10, cacheErrors: false },
      params: [[1], [1], [2, true], [2, true], [3], [3]],
      pause: 70
    },
    {
      description: 'default with NO cacheErrors, error last',
      options: { expire: 10, cacheErrors: false },
      params: [[1], [1], [2, true], [2, true]],
      pause: 70
    },
    {
      description: 'cacheLimit with cacheErrors',
      options: { cacheLimit: 3, expire: 10, cacheErrors: true },
      params: [[], [], [1], [1], [2], [2], [3, true], [3, true], [4], [4]],
      pause: 70
    },
    {
      description: 'cacheLimit with cacheErrors, error last',
      options: { cacheLimit: 3, expire: 10, cacheErrors: true },
      params: [[], [], [1], [1], [2], [2], [3, true], [3, true]],
      pause: 70
    },
    {
      description: 'cacheLimit with NO cacheErrors',
      options: { cacheLimit: 3, expire: 10, cacheErrors: false },
      params: [[], [], [1], [1], [2], [2], [3, true], [3, true], [4], [4]],
      pause: 70
    },
    {
      description: 'cacheLimit with NO cacheErrors, error last',
      options: { cacheLimit: 3, expire: 10, cacheErrors: false },
      params: [[], [], [1], [1], [2], [2], [3, true], [3, true]],
      pause: 70
    }
  ])('should clear cache on inactivity and fire "onCacheExpire", $description', async ({ options, params, pause }) => {
    const log: any[] = [];
    const logAsync: any[] = [];
    const mockOnCacheExpire = (response: unknown) => {
      log.push(response);
    };
    const mockOnCacheExpireAsync = async (response: unknown) => {
      logAsync.push(response);
    };
    const updateLog = async (aLog: any) =>
      Promise.all(
        aLog.map(async ({ all, removed, remaining }: any) => ({
          all: await Promise.allSettled(all.values()),
          removed: await Promise.allSettled(removed.values()),
          remaining: await Promise.allSettled(remaining.values())
        }))
      );

    const memoized = memo(
      (str: any, isError = false) => {
        const genStr = `${str}`;

        if (isError) {
          throw new Error(`onCacheRollout-${genStr}`);
        }

        return genStr;
      },
      { onCacheExpire: mockOnCacheExpire, ...options }
    );

    const memoizedAsync = memo(
      async (str: any, isError = false) => {
        const genStr = `${str}`;

        if (isError) {
          throw new Error(`onCacheRollout-${genStr}`);
        }

        return genStr;
      },
      { onCacheExpire: mockOnCacheExpireAsync, ...options }
    );

    for (const param of params) {
      try {
        await memoized(...param as [unknown]);
      } catch {}
    }

    jest.advanceTimersByTime(pause);

    for (const param of params) {
      try {
        await memoizedAsync(...param as [unknown]);
      } catch {}
    }

    jest.advanceTimersByTime(pause);

    await expect(updateLog(log)).resolves.toMatchSnapshot('sync');
    await expect(updateLog(logAsync)).resolves.toMatchSnapshot('async');
  });

  it.each([
    {
      description: 'no entries removed',
      options: { cacheLimit: 3 },
      params: [[], [], [1], [1], [2], [2]]
    },
    {
      description: 'one entry removed',
      options: { cacheLimit: 3 },
      params: [[], [], [1], [1], [2], [2], [3]]
    },
    {
      description: 'multiple entries removed',
      options: { cacheLimit: 3 },
      params: [[], [], [1], [1], [2], [2], [3], [4]]
    },
    {
      description: 'multiple entries removed, errors not cached',
      options: { cacheLimit: 3, cacheErrors: false },
      params: [[], [], [1, true], [1, true], [2], [2], [3], [4]]
    },
    {
      description: 'multiple entries removed, errors cached',
      options: { cacheLimit: 3, cacheErrors: true },
      params: [[], [], [1, true], [1, true], [2], [2], [3], [4]]
    }
  ])('should fire "onCacheRollout" callback on cache rollout, $description', async ({ options, params }) => {
    const log: any[] = [];
    const logAsync: any[] = [];
    const mockOnCacheRollout = (response: unknown) => {
      log.push(response);
    };
    const mockOnCacheRolloutAsync = async (response: unknown) => {
      logAsync.push(response);
    };
    const updateLog = async (aLog: any) =>
      Promise.all(
        aLog.map(async ({ removed, remaining }: any) => ({
          removed: await Promise.allSettled(removed.values()),
          remaining: await Promise.allSettled(remaining.values())
        }))
      );

    const memoized = memo(
      (str: any, isError = false) => {
        const genStr = `${str}`;

        if (isError) {
          throw new Error(`onCacheRollout-${genStr}`);
        }

        return genStr;
      },
      { onCacheRollout: mockOnCacheRollout, ...options }
    );

    const memoizedAsync = memo(
      async (str: any, isError = false) => {
        const genStr = `${str}`;

        if (isError) {
          throw new Error(`onCacheRollout-${genStr}`);
        }

        return genStr;
      },
      { onCacheRollout: mockOnCacheRolloutAsync, ...options }
    );

    for (const param of params) {
      try {
        await memoized(...param as [unknown]);
      } catch {}
    }

    for (const param of params) {
      try {
        await memoizedAsync(...param as [unknown]);
      } catch {}
    }

    await expect(updateLog(log)).resolves.toMatchSnapshot('sync');
    await expect(updateLog(logAsync)).resolves.toMatchSnapshot('async');
  });

  it('should return cached sync objects with isError: true without calling them', () => {
    let callCount = 0;
    const memoized = memo((value: string) => {
      callCount += 1;

      return { isError: true, value, callCount };
    }, { cacheLimit: 1, cacheErrors: true });

    expect(memoized('a')).toEqual({ isError: true, value: 'a', callCount: 1 });
    expect(memoized('a')).toEqual({ isError: true, value: 'a', callCount: 1 });
    expect(callCount).toBe(1);
  });

  it('should return sync objects with isError: true when cacheErrors is false', () => {
    let callCount = 0;
    const memoized = memo((value: string) => {
      callCount += 1;

      return { isError: true, value, callCount };
    }, { cacheLimit: 1, cacheErrors: false });

    expect(memoized('a')).toEqual({ isError: true, value: 'a', callCount: 1 });
    expect(memoized('a')).toEqual({ isError: true, value: 'a', callCount: 2 });
    expect(callCount).toBe(2);
  });

  it('should handle clear() without callback', () => {
    const mockDebug = jest.fn();
    const options = { cacheLimit: 1, debug: mockDebug };
    const memoized = memo((val: number) => val + Math.floor(Math.random() * 2), options);

    expect(memoized(1)).toBe(memoized(1));
    memoized.clear();

    expect(mockDebug).toHaveBeenCalledWith({
      type: 'memo clear',
      value: undefined,
      cache: new Map()
    });
  });

  it('should handle clear() with a callback', () => {
    const mockDebug = jest.fn();
    const mockCallback = jest.fn();
    const options = { cacheLimit: 1, debug: mockDebug, onCacheClear: mockCallback };
    const memoized = memo((val: number) => val + Math.floor(Math.random() * 2), options);

    expect(memoized(2)).toBe(memoized(2));
    memoized.clear();

    expect(mockDebug).toHaveBeenCalledWith({
      type: 'memo clear',
      value: undefined,
      cache: new Map()
    });

    const payload = mockCallback.mock.calls[0][0];

    expect([...payload.all.values()]).toHaveLength(1);
    expect([...payload.removed.values()]).toHaveLength(1);
    expect([...payload.remaining.values()]).toHaveLength(0);
  });

  it('should cancel pending expire timeout on clear()', () => {
    const mockOnCacheExpire = jest.fn();
    const mockOnCacheClear = jest.fn();
    const options = { expire: 50, cacheLimit: 1, onCacheClear: mockOnCacheClear, onCacheExpire: mockOnCacheExpire };
    const memoized = memo((val: number) => val + Math.floor(Math.random() * 2), options);

    expect(memoized(3)).toBe(memoized(3));
    memoized.clear();

    jest.advanceTimersByTime(100);
    expect(mockOnCacheClear).toHaveBeenCalledTimes(1);
    expect(mockOnCacheExpire).not.toHaveBeenCalled();
  });

  it('should support passing custom cache', async () => {
    const cache = new Map();
    const fn = jest.fn((val: number) => val * 2);
    const memoized = memo(fn, { cache });

    expect(memoized(5)).toBe(10);
    expect(memoized(5)).toBe(10);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(cache.size).toBe(1);
  });

  it('should support a minimal map-like cache without optional members', async () => {
    const backing = new Map<unknown, unknown>();
    const minimal = {
      has: (key: unknown) => backing.has(key),
      get: (key: unknown) => backing.get(key),
      set: (key: unknown, value: unknown) => backing.set(key, value)
    };

    // cacheLimit <= 0 calls clear() on every invocation
    const bypass = memo((val: number) => val * 2, { cache: minimal, cacheLimit: 0 });

    expect(() => bypass(1)).not.toThrow();
    expect(bypass(1)).toBe(2);

    // expire calls clear() from the timeout
    const expiring = memo((val: number) => val * 2, { cache: minimal, expire: 10 });

    expect(expiring(2)).toBe(4);
    expect(() => jest.advanceTimersByTime(20)).not.toThrow();

    // cacheErrors: false calls delete() on sync and async errors; the original error must surface
    const syncError = memo((_val: number): number => {
      throw new Error('sync boom');
    }, { cache: minimal, cacheErrors: false });

    expect(() => syncError(3)).toThrow('sync boom');

    const asyncError = memo(async (_val: number): Promise<number> => {
      throw new Error('async boom');
    }, { cache: minimal, cacheErrors: false });

    await expect(asyncError(4)).rejects.toThrow('async boom');

    // memoized.clear() reports false (nothing observable) but does not throw
    expect(expiring.clear()).toBe(false);
  });

  it('should clear a cache that implements clear() but not entries()', () => {
    const backing = new Map<unknown, unknown>();
    const mockOnCacheClear = jest.fn();
    const cache = {
      has: (key: unknown) => backing.has(key),
      get: (key: unknown) => backing.get(key),
      set: (key: unknown, value: unknown) => backing.set(key, value),
      clear: jest.fn(() => backing.clear())
    };
    const memoized = memo((val: number) => val * 2, { cache, onCacheClear: mockOnCacheClear });

    expect(memoized(5)).toBe(10);
    expect(backing.size).toBe(1);

    memoized.clear();

    expect(cache.clear).toHaveBeenCalledTimes(1);
    expect(backing.size).toBe(0);
    expect(mockOnCacheClear).toHaveBeenCalledTimes(1);
  });

  it('should return a stored promise from a custom cache without awaiting it', async () => {
    const cache = new Map();
    const fn = jest.fn(async (val: number) => val * 2);
    const memoized = memo(fn, { cache });

    const first = memoized(6);

    expect(first).toBeInstanceOf(Promise);
    expect(memoized(6)).toBe(first);
    await expect(first).resolves.toBe(12);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should hand memo context to a cache factory', async () => {
    const factory = jest.fn(() => new Map());
    const memoized = memo(async (val: number) => val, { cache: factory, cacheErrors: false, cacheLimit: 3 });

    await memoized(1);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith({ isFuncPromise: true, cacheErrors: false, cacheLimit: 3, expire: undefined });
  });
});

describe('normalizeMemoCache', () => {
  it('should return a Map by default without reporting an error', () => {
    const ctx = { isFuncPromise: false, cacheErrors: true, cacheLimit: 1, expire: undefined };
    const mockDebug = jest.fn();

    expect(normalizeMemoCache(undefined, { cacheContext: ctx, debug: mockDebug })).toBeInstanceOf(Map);
    expect(mockDebug).not.toHaveBeenCalled();
  });

  it('should normalize a map-like object', () => {
    const ctx = { isFuncPromise: false, cacheErrors: true, cacheLimit: 1, expire: undefined };
    const cache = { has: jest.fn(), get: jest.fn(), set: jest.fn() };

    const result = normalizeMemoCache(cache, { cacheContext: ctx });

    result.has('lorem');
    expect(cache.has).toHaveBeenCalledWith('lorem');

    result.get('ipsum');
    expect(cache.get).toHaveBeenCalledWith('ipsum');

    result.set('dolor', 'sit');
    expect(cache.set).toHaveBeenCalledWith('dolor', 'sit');

    expect(result).toMatchSnapshot('normalized');
  });

  it('should call a factory once with context and use its result', () => {
    const ctx = { isFuncPromise: false, cacheErrors: true, cacheLimit: 1, expire: undefined };
    const cache = new Map();
    const factory = jest.fn(() => cache);

    expect(normalizeMemoCache(factory, { cacheContext: ctx })).toBe(cache);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith(ctx);
  });

  it('should fall back to a Map when the factory throws or the value is not map-like', () => {
    const ctx = { isFuncPromise: false, cacheErrors: true, cacheLimit: 1, expire: undefined };
    const mockDebug = jest.fn();

    expect(normalizeMemoCache(() => {
      throw new Error('boom');
    }, { cacheContext: ctx, debug: mockDebug })).toBeInstanceOf(Map);

    expect(normalizeMemoCache(async () => new Map(), { cacheContext: ctx, debug: mockDebug })).toBeInstanceOf(Map);
    expect(normalizeMemoCache('nope', { cacheContext: ctx, debug: mockDebug })).toBeInstanceOf(Map);

    expect(mockDebug).toHaveBeenCalledTimes(3);
    expect(mockDebug).toHaveBeenCalledWith(expect.objectContaining({ type: 'memo cache error' }));
  });
});

describe('memoUnwrapAdapter', () => {
  const createMockStorage = (backingStore: any = new Map()) => ({
    backingStore,
    get: jest.fn((key: unknown) => backingStore.get(key)),
    set: jest.fn((key: unknown, value: unknown) => backingStore.set(key, value)),
    has: jest.fn((key: unknown) => backingStore.has(key)),
    delete: jest.fn((key: unknown) => backingStore.delete(key)),
    clear: jest.fn(() => backingStore.clear()),
    keys: jest.fn(() => backingStore.keys()),
    entries: jest.fn(() => backingStore.entries()),
    get size() {
      return backingStore.size;
    }
  });

  it.each([
    {
      description: 'sync function',
      isAsync: false,
      input: 42,
      expected: 'val-42'
    },
    {
      description: 'async function',
      isAsync: true,
      input: 99,
      expected: 'async-val-99'
    }
  ])('should delegate custom cache behavior to custom storage, $description', async ({ isAsync, input, expected }) => {
    const cache = createMockStorage();
    const fn = isAsync
      ? async (val: number) => `async-val-${val}`
      : (val: number) => `val-${val}`;

    const memoized = memo(fn, { cache });
    const result = await memoized(input);

    expect(result).toBe(expected);
    expect(cache.set).toHaveBeenCalledTimes(1);
    expect(cache.has).toHaveBeenCalledTimes(1);
    expect(cache.get).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      description: 'sync throwing storage.set',
      isAsync: false,
      storageError: () => {
        throw new Error('store write failed');
      },
      input: 5,
      expected: 10
    },
    {
      description: 'async rejecting storage.set',
      isAsync: true,
      storageError: () => Promise.reject(new Error('async store write failed')),
      input: 5,
      expected: 15
    }
  ])('should not throw if targetStore.set throws or rejects, $description', async ({ isAsync, storageError, input, expected }) => {
    const targetStore = {
      get: jest.fn(),
      has: jest.fn(() => false),
      set: jest.fn(storageError)
    };
    const cache = memoUnwrapAdapter(targetStore);

    const fn = isAsync
      ? async (val: number) => val * 3
      : (val: number) => val * 2;

    const memoized = memo(fn, { cache });

    if (isAsync) {
      await expect(memoized(input)).resolves.toBe(expected);
    } else {
      expect(() => memoized(input)).not.toThrow();
      expect(memoized(input)).toBe(expected);
    }
  });

  it.each([
    {
      description: 'sync error',
      isAsync: false,
      expectedProperty: 'isError'
    },
    {
      description: 'async error',
      isAsync: true,
      expectedProperty: 'message'
    }
  ])('should store errors to targetStore when cacheErrors is true, $description', async ({ isAsync, expectedProperty }) => {
    const targetStore = createMockStorage();
    const cache = memoUnwrapAdapter(targetStore, { cacheErrors: true });
    const fn = isAsync
      ? async () => {
        throw new Error('failure');
      }
      : () => {
        throw new Error('failure');
      };

    const memoized = memo(fn, { cache, cacheErrors: true });

    if (isAsync) {
      await expect(memoized()).rejects.toThrow('failure');
    } else {
      expect(() => memoized()).toThrow('failure');
    }

    expect(targetStore.set).toHaveBeenCalledTimes(1);
    expect((targetStore.set as jest.Mock).mock.calls[0][1]).toHaveProperty(expectedProperty);
  });

  it.each([
    {
      description: 'sync function',
      isAsync: false,
      input: 42,
      expected: 'val-42'
    },
    {
      description: 'async function',
      isAsync: true,
      input: 99,
      expected: 'async-val-99'
    }
  ])('should unwrap and persist resolved concrete values to targetStore, $description', async ({ isAsync, input, expected }) => {
    const targetStore = createMockStorage();
    const cache = memoUnwrapAdapter(targetStore);
    const fn = isAsync
      ? async (val: number) => `async-val-${val}`
      : (val: number) => `val-${val}`;

    const memoized = memo(fn, { cache });
    const result = await memoized(input);

    expect(result).toBe(expected);
    expect(targetStore.set).toHaveBeenCalledTimes(1);
    expect(targetStore.set).toHaveBeenCalledWith(expect.anything(), expected);
  });

  it('should hydrate from pre-populated targetStore on cache miss without calling func', async () => {
    const targetStore = createMockStorage();

    targetStore.backingStore.set('custom-key', 'pre-stored-value');

    const fnSpy = jest.fn();
    const fn = async (_val: string) => {
      fnSpy(_val);

      return 'new-value';
    };

    const cache = memoUnwrapAdapter(targetStore);
    const memoized = memo(fn, {
      cache,
      keyHash: args => args[0]
    });

    const result = await memoized('custom-key');

    expect(result).toBe('pre-stored-value');
    expect(fnSpy).not.toHaveBeenCalled();
    expect(targetStore.get).toHaveBeenCalledWith('custom-key');
  });

  it('should coalesce concurrent asynchronous calls to the same key into a single execution', async () => {
    let resolveCall: ((val: string) => void) | undefined;
    const fnSpy = jest.fn();
    const fn = async (_val: string) => new Promise<string>(resolve => {
      fnSpy(_val);
      resolveCall = resolve;
    });

    const targetStore = createMockStorage();
    const cache = memoUnwrapAdapter(targetStore);
    const memoized = memo(fn, { cache });

    const p1 = memoized('concurrent-key');
    const p2 = memoized('concurrent-key');
    const p3 = memoized('concurrent-key');

    resolveCall?.('concurrent-result');

    const [first, second, third] = await Promise.all([p1, p2, p3]);

    expect(first).toBe('concurrent-result');
    expect(second).toBe('concurrent-result');
    expect(third).toBe('concurrent-result');
    expect(fnSpy).toHaveBeenCalledTimes(1);
    expect(targetStore.set).toHaveBeenCalledTimes(1);
    expect(targetStore.set).toHaveBeenCalledWith(expect.anything(), 'concurrent-result');
  });

  it('should call targetStore.delete when async function rejects and cacheErrors is false', async () => {
    const targetStore = createMockStorage();
    const cache = memoUnwrapAdapter(targetStore, { cacheErrors: false });
    const memoized = memo(
      async () => {
        throw new Error('uncached failure');
      },
      { cache, cacheErrors: false }
    );

    await expect(memoized()).rejects.toThrow('uncached failure');
    expect(targetStore.delete).toHaveBeenCalledTimes(1);
    expect(targetStore.delete).toHaveBeenCalledWith(expect.anything());
    expect(targetStore.set).not.toHaveBeenCalled();
  });

  it('should support Promise-based targetStore', async () => {
    const targetStore = createMockStorage();
    const targetStorePromise = Promise.resolve(targetStore);
    const cache = memoUnwrapAdapter(targetStorePromise);

    const fn = async (val: number) => `promise-store-${val}`;
    const memoized = memo(fn, { cache });

    const result = await memoized(100);

    expect(result).toBe('promise-store-100');
    expect(targetStore.set).toHaveBeenCalledTimes(1);
    expect(targetStore.set).toHaveBeenCalledWith(expect.anything(), 'promise-store-100');
  });

  it('should delegate delete and clear to targetStore', () => {
    const targetStore = createMockStorage();

    targetStore.backingStore.set('del-key', 'del-val');
    const cache = memoUnwrapAdapter(targetStore);

    expect(cache.has('del-key')).toBe(true);
    cache.delete?.('del-key');
    expect(targetStore.delete).toHaveBeenCalledWith('del-key');
    expect(cache.has('del-key')).toBe(false);

    targetStore.backingStore.set('clr-key', 'clr-val');
    cache.clear?.();
    expect(targetStore.clear).toHaveBeenCalled();
    expect(cache.has('clr-key')).toBe(false);
  });

  it('should expose Map-like size, keys, and entries', () => {
    const targetStore = createMockStorage();

    targetStore.backingStore.set('k1', 'v1');
    const cache = memoUnwrapAdapter(targetStore);

    cache.set('k2', 'v2');

    expect(cache.size).toBe(1);
    expect(Array.from(cache.keys?.() || [])).toEqual(['k2']);

    // Hydrating k1 from targetStore pulls it into the active in-memory cache window
    expect(cache.get('k1')).toBe('v1');
    expect(cache.size).toBe(2);
    expect(Array.from(cache.keys?.() || [])).toEqual(expect.arrayContaining(['k1', 'k2']));
    expect(Array.from(cache.entries?.() || [])).toEqual(expect.arrayContaining([
      ['k1', 'v1'],
      ['k2', 'v2']
    ]));
  });

  it('should preserve falsy values and undefined in targetStore and inMemory', async () => {
    const targetStore = createMockStorage();
    const cache = memoUnwrapAdapter(targetStore);

    const fnUndefined = jest.fn(async () => undefined);
    const memoUndefined = memo(fnUndefined, { cache });

    expect(await memoUndefined()).toBeUndefined();
    expect(await memoUndefined()).toBeUndefined();
    expect(fnUndefined).toHaveBeenCalledTimes(1);
    expect(targetStore.set).toHaveBeenCalledWith(expect.anything(), undefined);

    const fnEmpty = jest.fn(async () => '');
    const memoEmpty = memo(fnEmpty, {
      cache,
      keyHash: () => 'empty-key'
    });

    expect(await memoEmpty()).toBe('');
    expect(await memoEmpty()).toBe('');
    expect(fnEmpty).toHaveBeenCalledTimes(1);
    expect(targetStore.set).toHaveBeenCalledWith(expect.anything(), '');
  });

  it('should call cache.delete when async function rejects and cacheErrors is false', async () => {
    const cache = createMockStorage();
    const memoized = memo(
      async () => {
        throw new Error('uncached failure');
      },
      { cache, cacheErrors: false }
    );

    await expect(memoized()).rejects.toThrow('uncached failure');
    expect(cache.delete).toHaveBeenCalledTimes(1);
    expect(cache.delete).toHaveBeenCalledWith(expect.anything());
  });
});
