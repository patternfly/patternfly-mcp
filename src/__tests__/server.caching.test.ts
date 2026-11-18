import { memo, normalizeMapLike, normalizeMemoCache } from '../server.caching';

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
      throw new Error('sync lorem ipsum');
    }, { cache: minimal, cacheErrors: false });

    expect(() => syncError(3)).toThrow('sync lorem ipsum');

    const asyncError = memo(async (_val: number): Promise<number> => {
      throw new Error('async dolor sit');
    }, { cache: minimal, cacheErrors: false });

    await expect(asyncError(4)).rejects.toThrow('async dolor sit');

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

  it('should catch and log errors thrown or rejected by cache change handlers without propagating', async () => {
    const syncHandler = () => {
      throw new Error('sync handler error');
    };
    const asyncHandler = async () => {
      throw new Error('async handler error');
    };

    const memoSync = memo((val: number) => val * 2, { onCacheClear: syncHandler });
    const memoAsync = memo((val: number) => val * 2, { onCacheClear: asyncHandler });

    memoSync(1);
    expect(() => memoSync.clear()).not.toThrow();

    memoAsync(2);
    expect(() => memoAsync.clear()).not.toThrow();
    await Promise.resolve();
  });

  it('should break early during cacheLimit eviction if keys iterator finishes early', () => {
    const cache = {
      has: () => false,
      get: () => 'val',
      set: jest.fn(),
      delete: jest.fn(),
      keys: () => [][Symbol.iterator](),
      get size() {
        return 5;
      }
    };

    const memoized = memo((val: number) => val, { cache, cacheLimit: 1 });

    expect(memoized(1)).toBe('val');
    expect(cache.delete).not.toHaveBeenCalled();
  });
});

describe('normalizeMapLike', () => {
  it('should return a native Map instance as-is', () => {
    const map = new Map();

    expect(normalizeMapLike(map)).toBe(map);
  });

  it('should normalize a minimal map-like object with default fallbacks', () => {
    const minimalCache = {
      has: jest.fn(() => true),
      get: jest.fn(() => 'value'),
      set: jest.fn()
    };

    const result = normalizeMapLike(minimalCache);

    expect(result.has('k')).toBe(true);
    expect(minimalCache.has).toHaveBeenCalledWith('k');

    expect(result.get('k')).toBe('value');
    expect(minimalCache.get).toHaveBeenCalledWith('k');

    result.set('k', 'v');
    expect(minimalCache.set).toHaveBeenCalledWith('k', 'v');

    expect(result.clear()).toBeUndefined();
    expect(result.delete('k')).toBeUndefined();
    expect(Array.from(result.keys())).toEqual([]);
    expect(Array.from(result.entries())).toEqual([]);
    expect(result.size).toBeUndefined();
  });

  it('should delegate optional methods and expose size when size, keys, and delete are present', () => {
    const fullCache = {
      has: jest.fn(() => false),
      get: jest.fn(),
      set: jest.fn(),
      clear: jest.fn(),
      delete: jest.fn(() => true),
      keys: jest.fn(() => ['k1'][Symbol.iterator]()),
      entries: jest.fn(() => [['k1', 'v1'] as [unknown, unknown]][Symbol.iterator]()),
      size: 1
    };

    const result = normalizeMapLike(fullCache);

    result.clear();
    expect(fullCache.clear).toHaveBeenCalledTimes(1);

    expect(result.delete('k1')).toBe(true);
    expect(fullCache.delete).toHaveBeenCalledWith('k1');

    expect(Array.from(result.keys())).toEqual(['k1']);
    expect(fullCache.keys).toHaveBeenCalledTimes(1);

    expect(Array.from(result.entries())).toEqual([['k1', 'v1']]);
    expect(fullCache.entries).toHaveBeenCalledTimes(1);

    expect(result.size).toBe(1);
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
      throw new Error('lorem ipsum');
    }, { cacheContext: ctx, debug: mockDebug })).toBeInstanceOf(Map);

    expect(normalizeMemoCache(async () => new Map(), { cacheContext: ctx, debug: mockDebug })).toBeInstanceOf(Map);
    expect(normalizeMemoCache('nope', { cacheContext: ctx, debug: mockDebug })).toBeInstanceOf(Map);
    expect(normalizeMemoCache('nope')).toBeInstanceOf(Map);

    expect(mockDebug).toHaveBeenCalledTimes(3);
    expect(mockDebug).toHaveBeenCalledWith(expect.objectContaining({ type: 'memo cache error' }));
  });
});
