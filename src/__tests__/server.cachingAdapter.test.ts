import { memo } from '../server.caching';
import { memoSettledAdapter } from '../server.cachingAdapter';

describe('memoSettledAdapter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    await jest.runOnlyPendingTimersAsync();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it.each([
    {
      method: 'set',
      run: (cache: any) => cache.set('k2', 'v2'),
      expected: expect.objectContaining({
        clear: expect.any(Function),
        delete: expect.any(Function),
        entries: expect.any(Function),
        get: expect.any(Function),
        has: expect.any(Function),
        keys: expect.any(Function),
        set: expect.any(Function)
      })
    },
    {
      method: 'has',
      run: (cache: any) => cache.has('k1'),
      expected: true
    },
    {
      method: 'get',
      run: (cache: any) => cache.get('k1'),
      expected: 'v1'
    },
    {
      method: 'size',
      run: (cache: any) => {
        cache.get('k1');

        return cache.size;
      },
      expected: 1
    },
    {
      method: 'keys',
      run: (cache: any) => {
        cache.get('k1');

        return Array.from(cache.keys?.() || []);
      },
      expected: ['k1']
    },
    {
      method: 'entries',
      run: (cache: any) => {
        cache.get('k1');

        return Array.from(cache.entries?.() || []);
      },
      expected: [['k1', 'v1']]
    },
    {
      method: 'delete',
      run: (cache: any) => cache.delete?.('k1'),
      expected: true
    },
    {
      method: 'clear',
      run: (cache: any) => cache.clear?.(),
      expected: undefined
    }
  ])('should expose working map-like member, $method', ({ run, expected }) => {
    const targetStore = new Map([['k1', { status: 'fulfilled' as const, value: 'v1' }]]);
    const cache = memoSettledAdapter(targetStore)();

    expect(run(cache)).toEqual(expected);
  });

  it.each([
    {
      description: 'concrete value',
      value: 'sync-val',
      expected: 'sync-val',
      expectedStored: { status: 'fulfilled', value: 'sync-val' }
    },
    {
      description: 'resolved promise value',
      value: Promise.resolve('async-val'),
      expected: Promise.resolve('async-val'),
      expectedStored: { isPromise: true, status: 'fulfilled', value: 'async-val' }
    },
    {
      description: 'non-callable isError object',
      value: { isError: true, data: 'valid-value' },
      expected: { isError: true, data: 'valid-value' },
      expectedStored: { status: 'fulfilled', value: { isError: true, data: 'valid-value' } }
    }
  ])('should unwrap and persist to targetStore, $description', async ({ value, expectedStored }) => {
    const targetStore = new Map();
    const cache = memoSettledAdapter(targetStore)();

    cache.set('key', value);
    // Immediate read returns the staged entry as-is
    expect(cache.get('key')).toBe(value);

    await jest.advanceTimersByTimeAsync(0);

    expect(targetStore.has('key')).toBe(true);
    expect(targetStore.get('key')).toEqual(expectedStored);

    await expect(Promise.resolve(cache.get('key'))).resolves.toEqual(expectedStored.value);
  });

  it.each([
    {
      description: 'persist rejected promise when cacheErrors is true',
      createErrorEntry: (error: Error) => Promise.reject(error),
      cacheErrors: true,
      expectedHas: true
    },
    {
      description: 'delete rejected promise when cacheErrors is false',
      createErrorEntry: (error: Error) => Promise.reject(error),
      cacheErrors: false,
      expectedHas: false
    },
    {
      description: 'persist sync-error wrapper when cacheErrors is true',
      createErrorEntry: (error: Error) => Object.assign(() => {
        throw error;
      }, { isError: true }),
      cacheErrors: true,
      expectedHas: true
    },
    {
      description: 'delete sync-error wrapper when cacheErrors is false',
      createErrorEntry: (error: Error) => Object.assign(() => {
        throw error;
      }, { isError: true }),
      cacheErrors: false,
      expectedHas: false
    }
  ])('should handle cacheErrors, $description', async ({ createErrorEntry, cacheErrors, expectedHas }) => {
    const targetStore = new Map([['key', 'stale-val']]);
    const cache = memoSettledAdapter(targetStore as any, { cacheErrors })();
    const error = new Error('lorem ipsum');
    const entry = createErrorEntry(error);

    cache.set('key', entry);
    expect(cache.has('key')).toBe(true);
    expect(cache.get('key')).toBe(entry);

    await jest.advanceTimersByTimeAsync(0);

    expect(targetStore.has('key')).toBe(expectedHas);
    expect(typeof targetStore.get('key')).not.toBe('function');
    expect(targetStore.get('key')).toMatchSnapshot();
  });

  it('should ignore a superseded in-flight promise when a concrete value replaces the same key', async () => {
    const targetStore = new Map();
    const cache = memoSettledAdapter(targetStore)();

    let resolveOld: (value: string) => void = () => {};
    const oldPromise = new Promise<string>(resolve => {
      resolveOld = resolve;
    });

    // Pending promise, then a concrete write to the same key
    cache.set('key', oldPromise);
    expect(cache.get('key')).toBe(oldPromise);

    cache.set('key', 'newer');

    // Newer value is immediately visible and persists after settlement
    expect(cache.get('key')).toBe('newer');

    await jest.advanceTimersByTimeAsync(0);

    expect(targetStore.get('key')).toEqual({ status: 'fulfilled', value: 'newer' });

    // Late settlement of the superseded promise must NOT "clobber" the newer value
    resolveOld('older');
    await oldPromise;
    await jest.advanceTimersByTimeAsync(0);

    expect(targetStore.get('key')).toEqual({ status: 'fulfilled', value: 'newer' });
    expect(cache.get('key')).toBe('newer');
  });

  it.each([
    {
      description: 'not deleting the newer value when cacheErrors is false',
      cacheErrors: false
    },
    {
      description: 'not overwriting the newer value with the error when cacheErrors is true',
      cacheErrors: true
    }
  ])('should handle superseded in-flight promise rejects by $description', async ({ cacheErrors }) => {
    const targetStore = new Map();
    const cache = memoSettledAdapter(targetStore, { cacheErrors })();

    let rejectOld: (reason: unknown) => void = () => {};
    const oldPromise = new Promise<string>((_resolve, reject) => {
      rejectOld = reject;
    });

    cache.set('key', oldPromise);
    cache.set('key', 'newer');

    expect(cache.get('key')).toBe('newer');

    await jest.advanceTimersByTimeAsync(0);

    expect(targetStore.get('key')).toEqual({ status: 'fulfilled', value: 'newer' });

    rejectOld(new Error('dolor sit'));
    await expect(oldPromise).rejects.toThrow('dolor sit');

    await jest.advanceTimersByTimeAsync(0);

    // Superseded rejection must not delete or overwrite the newer entry
    expect(targetStore.has('key')).toBe(true);
    expect(targetStore.get('key')).toEqual({ status: 'fulfilled', value: 'newer' });
    expect(cache.get('key')).toBe('newer');
  });

  it('should report existence from any tier on delete and ignore a deleted in-flight promise on settlement', async () => {
    const targetStore = new Map([['l2-only', 'persisted']]);
    const cache = memoSettledAdapter(targetStore as any)();

    // Unknown key, nothing observable
    expect(cache.delete?.('missing')).toBe(false);

    // Entry only in target store
    expect(cache.delete?.('l2-only')).toBe(true);
    expect(cache.has('l2-only')).toBe(false);
    expect(targetStore.has('l2-only')).toBe(true);

    await jest.advanceTimersByTimeAsync(0);

    expect(cache.has('l2-only')).toBe(false);
    expect(targetStore.has('l2-only')).toBe(false);

    // Hydrated entry
    targetStore.set('hydrated', 'val');
    expect(cache.get('hydrated')).toBe('val');
    expect(cache.size).toBe(1);
    expect(cache.delete?.('hydrated')).toBe(true);
    expect(cache.size).toBe(0);

    await jest.advanceTimersByTimeAsync(0);

    expect(targetStore.has('hydrated')).toBe(false);

    // Staged entry: delete returns true and late settlement does not restore it
    let resolvePending: (value: string) => void = () => {};
    const pending = new Promise<string>(resolve => {
      resolvePending = resolve;
    });

    cache.set('in-flight', pending);
    expect(cache.delete?.('in-flight')).toBe(true);
    expect(cache.has('in-flight')).toBe(false);

    resolvePending('late');
    await pending;
    await jest.advanceTimersByTimeAsync(0);

    expect(targetStore.has('in-flight')).toBe(false);
    expect(cache.has('in-flight')).toBe(false);
  });

  it('should return false from delete while the targetStore is pending but still queue the delete', async () => {
    let resolveStore: ((store: Map<unknown, unknown>) => void) | undefined;
    const targetStore = new Map([['existing', 'val']]);
    const storePromise = new Promise<Map<unknown, unknown>>(resolve => {
      resolveStore = resolve;
    });
    const cache = memoSettledAdapter(storePromise as any)();

    // Store is not observable while pending
    expect(cache.has('existing')).toBe(false);
    expect(cache.delete?.('existing')).toBe(false);

    resolveStore?.(targetStore);
    await storePromise;
    await jest.advanceTimersByTimeAsync(0);

    // Queued delete is applied once the store resolves
    expect(targetStore.has('existing')).toBe(false);
  });

  it('should return a sync memoized value while the targetStore is pending and persist once resolved', async () => {
    let resolveStore: ((store: Map<unknown, unknown>) => void) | undefined;
    const storePromise = new Promise<Map<unknown, unknown>>(resolve => {
      resolveStore = resolve;
    });
    const mockFunc = jest.fn((val: number) => val * 2);
    const memoized = memo(mockFunc, { cache: memoSettledAdapter(storePromise as any) });

    // Returns the memoized value while the store is pending
    expect(memoized(2)).toBe(4);
    expect(memoized(2)).toBe(4);
    expect(mockFunc).toHaveBeenCalledTimes(1);

    // A settled staged value remains readable until the queued write reaches the store.
    await jest.advanceTimersByTimeAsync(0);

    expect(memoized(2)).toBe(4);
    expect(mockFunc).toHaveBeenCalledTimes(1);

    const store = new Map();

    resolveStore?.(store);
    await storePromise;
    await jest.advanceTimersByTimeAsync(0);

    // Queued write landed once the store resolved
    expect(Array.from(store.values())).toEqual([{ status: 'fulfilled', value: 4 }]);
    expect(memoized(2)).toBe(4);

    // A rejected store never resolves, but the sync value is still returned
    const rejected = Promise.reject(new Error('no db'));
    const failed = memo((val: number) => val + 1, { cache: memoSettledAdapter(rejected) });

    await expect(rejected).rejects.toThrow('no db');

    await jest.advanceTimersByTimeAsync(0);

    expect(failed(1)).toBe(2);
  });

  it('should hydrate fulfilled and rejected Promise-returning target-store reads', async () => {
    const fulfilledStore = {
      has: () => true,
      get: () => Promise.resolve({ status: 'fulfilled' as const, value: 'stored' }),
      set: () => undefined
    };
    let fulfilledCalls = 0;
    const fulfilledMemo = memo(async () => {
      fulfilledCalls += 1;

      return 'fallback';
    }, { cache: memoSettledAdapter(fulfilledStore as any) });

    await expect(fulfilledMemo()).resolves.toBe('stored');
    expect(fulfilledCalls).toBe(0);

    const error = new Error('stored rejection');
    const rejectedStore = {
      has: () => true,
      get: () => Promise.resolve({ isPromise: true, status: 'rejected' as const, reason: error }),
      set: () => undefined
    };
    let rejectedCalls = 0;
    const rejectedMemo = memo(async () => {
      rejectedCalls += 1;

      return 'fallback';
    }, { cache: memoSettledAdapter(rejectedStore as any) });

    await expect(rejectedMemo()).rejects.toThrow('stored rejection');
    expect(rejectedCalls).toBe(0);
  });

  it.each([
    { description: 'undefined', value: undefined },
    { description: 'NaN', value: Number.NaN },
    { description: 'null', value: null },
    { description: 'false', value: false },
    { description: 'zero', value: 0 },
    { description: 'negative zero', value: -0 },
    { description: 'empty string', value: '' },
    { description: 'symbol', value: Symbol('unique') }
  ])('should persist values on settlement, and not persist if memo clears before settlement, $description', async ({ value }) => {
    const clearedStore = new Map();
    const clearedMemo = memo(() => value, { cache: memoSettledAdapter(clearedStore) });

    expect(Object.is(clearedMemo(), value)).toBe(true);
    clearedMemo.clear();

    await jest.advanceTimersByTimeAsync(0);

    expect(clearedStore.size).toBe(0);

    const settledStore = new Map();
    const settledFn = jest.fn(() => value);
    const settledMemo = memo(settledFn, { cache: memoSettledAdapter(settledStore) });

    expect(Object.is(settledMemo(), value)).toBe(true);

    await jest.advanceTimersByTimeAsync(0);

    expect(settledStore.size).toBe(1);
    expect(Array.from(settledStore.values())).toEqual([{ status: 'fulfilled', value }]);

    // Immediate call after clear does not rehydrate the not-yet-cleared targetStore entry
    settledMemo.clear();
    expect(Object.is(settledMemo(), value)).toBe(true);
    expect(settledFn).toHaveBeenCalledTimes(2);
  });

  it('should hydrate readCache from targetStore on get and expose active window via size, keys, and entries', () => {
    const targetStore = new Map([
      ['k1', 'v1'],
      ['k2', 'v2']
    ]);
    const cache = memoSettledAdapter(targetStore as any)();

    // Before hydration, readCache window is empty even though targetStore has entries
    expect(cache.size).toBe(0);
    expect(cache.has('k1')).toBe(true);
    expect(cache.has('missing')).toBe(false);
    expect(cache.get('missing')).toBeUndefined();

    // Accessing k1 hydrates only k1 into the readCache window
    expect(cache.get('k1')).toBe('v1');
    expect(cache.size).toBe(1);
    expect(Array.from(cache.keys?.() || [])).toEqual(['k1']);
    expect(Array.from(cache.entries?.() || [])).toEqual([['k1', 'v1']]);
  });

  it('should surgically evict keys from readCache on set and delete, and clear all tiers on clear', async () => {
    const targetStore = new Map([
      ['k1', 'v1'],
      ['k2', 'v2']
    ]);
    const cache = memoSettledAdapter(targetStore as any)();

    // Hydrate both keys into readCache
    expect(cache.get('k1')).toBe('v1');
    expect(cache.get('k2')).toBe('v2');
    expect(cache.size).toBe(2);

    // Updating k1 evicts k1 from readCache without disturbing k2, and updates targetStore
    cache.set('k1', 'v1-updated');
    expect(cache.size).toBe(1);
    expect(Array.from(cache.keys?.() || [])).toEqual(['k2']);

    await jest.advanceTimersByTimeAsync(0);

    expect(targetStore.get('k1')).toEqual({ status: 'fulfilled', value: 'v1-updated' });

    // Deleting k2 removes it from readCache and targetStore
    expect(cache.delete?.('k2')).toBe(true);

    await jest.advanceTimersByTimeAsync(0);

    expect(cache.has('k2')).toBe(false);
    expect(targetStore.has('k2')).toBe(false);

    // Clearing empties all cache layers and target store
    expect(cache.get('k1')).toBe('v1-updated');
    expect(cache.size).toBe(1);
    cache.clear?.();

    await jest.advanceTimersByTimeAsync(0);

    expect(cache.size).toBe(0);
    expect(targetStore.size).toBe(0);

    // In-flight promises cleared before settling do not persist stale values
    let resolveStale: ((val: string) => void) | undefined;
    const stalePromise = new Promise<string>(resolve => {
      resolveStale = resolve;
    });

    cache.set('stale-in-flight', stalePromise);
    cache.clear?.();
    resolveStale?.('stale-val');
    await stalePromise;

    await jest.advanceTimersByTimeAsync(0);

    expect(targetStore.has('stale-in-flight')).toBe(false);
  });

  it('should queue writes for a pending Promise targetStore and flush once resolved', async () => {
    let resolveStore: ((store: Map<unknown, unknown>) => void) | undefined;
    const targetStore = new Map([['existing', 'val']]);
    const storePromise = new Promise<Map<unknown, unknown>>(resolve => {
      resolveStore = resolve;
    });

    const cache = memoSettledAdapter(storePromise as any)();

    cache.set('cleared-key', 'stale-val');
    cache.clear?.();
    cache.set('existing', 'restored-val');
    cache.set('queued-set', 'queued-val');
    cache.delete?.('existing');

    resolveStore?.(targetStore);
    await storePromise;
    await jest.advanceTimersByTimeAsync(0);

    expect(targetStore.has('cleared-key')).toBe(false);
    expect(targetStore.get('queued-set')).toEqual({ status: 'fulfilled', value: 'queued-val' });
    expect(targetStore.has('existing')).toBe(false);
  });

  it('should gracefully handle a rejecting Promise targetStore and faulty store methods', async () => {
    const rejectingStore = Promise.reject(new Error('store init failed'));
    const asyncCache = memoSettledAdapter(rejectingStore)({});

    asyncCache.set('k', 'v');

    await jest.advanceTimersByTimeAsync(0);

    expect(asyncCache.get('k')).toBeUndefined();

    const faultyStore = {
      has: () => {
        throw new Error('sync has error');
      },
      get: () => {
        throw new Error('sync get error');
      },
      set: () => Promise.reject(new Error('async set error')),
      delete: () => {
        throw new Error('sync delete error');
      },
      clear: () => {
        throw new Error('sync clear error');
      }
    };

    const faultyCache = memoSettledAdapter(faultyStore)();

    expect(() => faultyCache.has('k')).not.toThrow();
    expect(faultyCache.has('k')).toBe(false);
    expect(faultyCache.get('k')).toBeUndefined();
    expect(() => faultyCache.set('k', 'v' as any)).not.toThrow();
    expect(() => faultyCache.delete?.('k')).not.toThrow();
    expect(faultyCache.delete?.('k')).toBe(false);
    expect(faultyCache.clear?.()).toBeUndefined();
    expect(() => faultyCache.set('k', 'v' as any)).not.toThrow();
  });

  it.each([
    {
      description: 'resolved Error value',
      func: async () => new Error('lorem ipsum'),
      rejects: false
    },
    {
      description: 'rejected Error reason',
      func: async () => {
        throw new Error('lorem ipsum');
      },
      rejects: true
    }
  ])('should persist as a settled record and rehydrate it, $description', async ({ func, rejects }) => {
    const targetStore = new Map();
    const mockFunc = jest.fn(func);
    const myMemoFunc = memo(mockFunc, { cache: memoSettledAdapter(targetStore, { cacheErrors: true }) });

    const call = async () => {
      try {
        return { value: await myMemoFunc(), caught: undefined };
      } catch (caught) {
        return { value: undefined, caught };
      }
    };

    // First call, in-flight: memo's own semantics apply (resolve vs. reject).
    const first = await call();

    expect(first.caught instanceof Error).toBe(rejects);
    expect(first.value instanceof Error).toBe(!rejects);

    // The store receives a settled record; only status distinguishes the two.
    await jest.advanceTimersByTimeAsync(0);

    expect(targetStore.size).toBe(1);
    const [record] = Array.from(targetStore.values());

    expect(record?.status).toBe(rejects ? 'rejected' : 'fulfilled');
    expect(record?.isPromise).toBe(true);
    expect(record?.status === 'rejected' ? record.reason : record?.value).toBeInstanceOf(Error);

    // Second call, hydrated from targetStore: a rejection is still a rejection, a value is still a value.
    const second = await call();

    expect(second.caught instanceof Error).toBe(rejects);
    expect(second.value instanceof Error).toBe(!rejects);
    expect(((second.caught ?? second.value) as Error).message).toBe('lorem ipsum');

    // The underlying function was NOT re-invoked; the value came from the store.
    expect(mockFunc).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      description: 'Error instance',
      stored: { status: 'rejected', reason: new Error('sync lorem ipsum') },
      expected: expect.any(Function),
      errorMessage: 'sync lorem ipsum'
    },
    {
      description: 'string reason',
      stored: { status: 'rejected', reason: 'sync string failure' },
      expected: expect.any(Function),
      errorMessage: 'sync string failure'
    },
    {
      description: 'plain object reason',
      stored: { status: 'rejected', reason: { code: 500, message: 'fail' } },
      expected: expect.any(Function),
      errorMessage: undefined
    },
    {
      description: 'undefined reason',
      stored: { status: 'rejected', reason: undefined },
      expected: expect.any(Function),
      errorMessage: undefined
    }
  ])('should hydrate a pre-seeded rejection from targetStore, $description', ({ stored, expected, errorMessage }) => {
    const targetStore = new Map<string, unknown>([['key', stored]]);
    const cache = memoSettledAdapter(targetStore as any)();
    const entry = cache.get('key') as any;

    expect(entry).toEqual(expected);
    expect(Array.from(cache.entries?.() || [])).toEqual([['key', expected]]);
    expect(typeof entry).toBe('function');
    expect(entry.isError).toBe(true);
    expect(() => entry()).toThrow(errorMessage);
  });

  it.each([
    {
      description: 'plain string value',
      stored: 'sit',
      expected: 'sit'
    },
    {
      description: 'fulfilled settled envelope',
      stored: { status: 'fulfilled', value: 'new' },
      expected: 'new'
    },
    {
      description: 'fulfilled Error instance',
      stored: { status: 'fulfilled', value: new Error('resolved error') },
      expected: new Error('resolved error')
    },
    {
      description: 'non-settled object with a status property',
      stored: { status: 'custom', value: 'raw' },
      expected: { status: 'custom', value: 'raw' }
    },
    {
      description: 'sync function value',
      stored: () => 'lorem ipsum',
      expected: expect.any(Function)
    },
    {
      description: 'async function value',
      stored: async () => 'lorem ipsum',
      expected: expect.any(Function)
    }
  ])('should hydrate a pre-seeded fulfillment from targetStore, $description', ({ stored, expected }) => {
    const targetStore = new Map<string, unknown>([['key', stored]]);
    const cache = memoSettledAdapter(targetStore as any)();

    expect(cache.get('key')).toEqual(expected);
    expect(Array.from(cache.entries?.() || [])).toEqual([['key', expected]]);
  });
});
