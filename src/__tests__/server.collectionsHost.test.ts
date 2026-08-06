import { requestInvoke, createCollectionsHost } from '../server.collectionsHost';

describe('requestInvoke', () => {
  let mockSend: jest.Mock;

  beforeEach(() => {
    mockSend = jest.fn();
    process.send = mockSend;
  });

  afterEach(() => {
    delete (process as any).send;
    jest.clearAllMocks();
  });

  it.each([
    {
      description: 'successful handler',
      handlerResult: { data: 'result' },
      stateCollectionId: 'coll-1',
      requestCollectionId: 'coll-1'
    },
    {
      description: 'handler returning promise',
      handlerResult: Promise.resolve({ data: 'async-result' }),
      stateCollectionId: 'coll-1',
      requestCollectionId: 'coll-1'
    },
    {
      description: 'handler throwing error',
      handlerResult: Promise.reject(new Error('Handler error')),
      stateCollectionId: 'coll-1',
      requestCollectionId: 'coll-1'
    },
    {
      description: 'handler returning error',
      handlerResult: new Error('Handler error'),
      stateCollectionId: 'coll-1',
      requestCollectionId: 'coll-1'
    },
    {
      description: 'mismatched state and request collection IDs',
      handlerResult: { data: 'result' },
      stateCollectionId: 'coll-1',
      requestCollectionId: 'coll-2'
    },
    {
      description: 'handler returning AggregateError',
      handlerResult: new AggregateError(['Handler error']),
      stateCollectionId: 'coll-1',
      requestCollectionId: 'coll-1'
    },
    {
      description: 'handler attempting to return an error-like object, with message',
      handlerResult: { message: 'Handler error' },
      stateCollectionId: 'coll-1',
      requestCollectionId: 'coll-1'
    },
    {
      description: 'handler attempting to return an error-like object, with single line stack',
      handlerResult: { message: 'Handler error', stack: 'Stack trace' },
      stateCollectionId: 'coll-1',
      requestCollectionId: 'coll-1'
    },
    {
      description: 'handler attempting to return an error-like object, with name and single line stack',
      handlerResult: { name: 'Mock ERROR', message: 'Handler error', stack: 'Stack trace' },
      stateCollectionId: 'coll-1',
      requestCollectionId: 'coll-1'
    },
    {
      description: 'handler attempting to return an error-like object, with name and multiline line stack',
      handlerResult: { name: 'Mock', message: 'Handler error', stack: 'Stack trace\nSecond line' },
      stateCollectionId: 'coll-1',
      requestCollectionId: 'coll-1'
    },
    {
      description: 'handler attempting to return a DOMException-like object, with name, message and multiline line stack',
      handlerResult: { name: 'DOMException', message: 'Handler error', stack: 'DOMException: message\n at line x' },
      stateCollectionId: 'coll-1',
      requestCollectionId: 'coll-1'
    },
    {
      description: 'handler attempting to return a browser-like ErrorEvent-like object, with name, message and multiline line stack',
      handlerResult: { name: 'ErrorEvent', message: 'Handler error', stack: 'ErrorEvent: message\n at line x' },
      stateCollectionId: 'coll-1',
      requestCollectionId: 'coll-1'
    },
    {
      description: 'handler returning undefined',
      handlerResult: undefined,
      stateCollectionId: 'coll-1',
      requestCollectionId: 'coll-1'
    },
    {
      description: 'handler returning null',
      handlerResult: null,
      stateCollectionId: 'coll-1',
      requestCollectionId: 'coll-1'
    }
  ])('should attempt collection invocation, $description', async ({ handlerResult, stateCollectionId, requestCollectionId }) => {
    const mockState = {
      collectionMap: new Map(),
      descriptors: [
        {
          id: stateCollectionId,
          name: 'CollectionName',
          source: 'module1'
        }
      ],
      invokeTimeoutMs: 1000
    };

    mockState.collectionMap.set(
      stateCollectionId,
      [
        'CollectionName',
        jest.fn().mockImplementation(async () => handlerResult),
        { runInChildProcess: true }
      ]
    );

    const ctx = { send: jest.fn() };

    const promise = requestInvoke(mockState as any, { t: 'invoke', id: 'request-id', collectionId: requestCollectionId, args: { param: 'value' } }, ctx);

    await promise;

    expect(ctx.send.mock.calls.length).toBe(1);

    const { error, ...rest } = ctx.send.mock.calls[0][0];

    expect({
      ...((error?.message && { error: error?.message }) || undefined),
      ...rest
    }).toMatchSnapshot();
  });

  it('should timeout when handler takes too long', async () => {
    jest.useFakeTimers();

    const stateCollectionId = 'coll-1';
    const requestCollectionId = 'coll-1';
    const mockState = {
      collectionMap: new Map(),
      descriptors: [
        {
          id: stateCollectionId,
          name: 'CollectionName',
          source: 'module1'
        }
      ],
      invokeTimeoutMs: 100
    };

    // Create a handler that resolves after timeout would fire
    const handler = jest.fn(() => new Promise(resolve => {
      setTimeout(resolve, 101);
    }));

    mockState.collectionMap.set(
      stateCollectionId,
      [
        'CollectionName',
        handler,
        { runInChildProcess: true }
      ]
    );

    const ctx = { send: jest.fn() };

    const invokePromise = requestInvoke(mockState as any, { t: 'invoke', id: 'request-id', collectionId: requestCollectionId, args: {} }, ctx);

    // Wait for handler to be called, timeout to be set up
    await Promise.resolve();

    // Advance timers past timeout
    jest.advanceTimersByTime(102);

    // Wait for the timeout message to be sent
    await Promise.resolve();

    // Verify timeout message was sent
    expect(ctx.send.mock.calls).toMatchSnapshot();

    // Wait for the function to complete
    await invokePromise;

    expect(ctx.send).toHaveBeenCalledTimes(1);

    jest.useRealTimers();
  });
});

describe('createCollectionsHost', () => {
  it('should route load then reply with load:ack via the host', async () => {
    const sendSpy = jest.fn();

    (process as any).send = sendSpy;

    const { bootstrapMessage } = createCollectionsHost();

    await bootstrapMessage({ t: 'load', id: 'L1', specs: [] } as any);

    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({ t: 'load:ack', id: 'L1', warnings: [], errors: [] })
    );
  });
});
