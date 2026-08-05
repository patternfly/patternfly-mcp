import { registerCollections } from '../collections';

jest.mock('../logger', () => ({
  log: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  },
  formatUnknownError: jest.fn(err => String(err))
}));

describe('registerCollections', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should register valid collections and call onUpdate', async () => {
    const onUpdate = jest.fn();
    const handler = jest.fn().mockResolvedValue({ records: [] });
    const collections: any[] = [
      ['test-collection', handler]
    ];

    await registerCollections(collections, { onUpdate });

    expect(handler).toHaveBeenCalled();
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      name: 'test-collection',
      response: { records: [] }
    }));
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
