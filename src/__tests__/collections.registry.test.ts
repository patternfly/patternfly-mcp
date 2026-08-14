import {
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

describe('collections registry utilities', () => {
  beforeEach(() => {
    // Ensure clean registry state between tests
    const registry = getServerRecordsRegistry() as Map<string, any>;

    registry.clear();

    jest.clearAllMocks();
  });

  describe('getServerRecordsRegistry', () => {
    it('returns the full registry Map when called without params', () => {
      const registry = getServerRecordsRegistry();

      expect(registry).toBeInstanceOf(Map);
      expect((registry as Map<string, unknown>).size).toBe(0);
    });

    it('returns a specific collection by name when available', async () => {
      const response = { records: [{ id: '1', sourceId: 's', sourceType: 'local' }] } as any;

      await setServerRecordsRegistry({ name: 'alpha', response });

      expect(getServerRecordsRegistry({ collectionName: 'alpha' })).toEqual(response);
      expect(getServerRecordsRegistry({ collectionName: 'beta' })).toBeUndefined();
    });
  });

  describe('onUpdateServerRecordsRegistry', () => {
    it('returns a no-op unsubscribe when callback is not a function', () => {
      // @ts-expect-error intentional misuse to test guard
      const unsubscribe = onUpdateServerRecordsRegistry(null);

      expect(unsubscribe()).toBe(false);
    });

    it('registers and unregisters listener correctly', async () => {
      const handler = jest.fn();
      const unsubscribe = onUpdateServerRecordsRegistry(handler);

      await setServerRecordsRegistry({ name: 'gamma', response: { records: [] } as any });

      expect(handler).toHaveBeenCalledWith({ name: 'gamma', response: { records: [] }, error: undefined });

      expect(unsubscribe()).toBe(true);
      expect(unsubscribe()).toBe(false);

      await setServerRecordsRegistry({ name: 'delta', response: { records: [] } as any });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('continues processing when a listener throws', async () => {
      const faulty = jest.fn().mockRejectedValue(new Error('boom'));
      const good = jest.fn();

      onUpdateServerRecordsRegistry(faulty);
      onUpdateServerRecordsRegistry(good);

      await setServerRecordsRegistry({ name: 'omega', response: { records: [] } as any });
      expect(good).toHaveBeenCalled();
    });
  });

  describe('setServerRecordsRegistry', () => {
    it('stores records when name and response are provided', async () => {
      await setServerRecordsRegistry({ name: 'alpha', response: { records: [{ id: 'x' }] } as any });

      const stored = getServerRecordsRegistry({ collectionName: 'alpha' });

      expect(stored).toEqual({ records: [{ id: 'x' }] });
    });

    it('does not store or notify when response is missing', async () => {
      const listener = jest.fn();

      onUpdateServerRecordsRegistry(listener);

      await setServerRecordsRegistry({ name: 'noop' });

      expect(getServerRecordsRegistry({ collectionName: 'noop' })).toBeUndefined();
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
