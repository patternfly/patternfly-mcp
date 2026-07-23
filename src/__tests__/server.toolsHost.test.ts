import { z } from 'zod';
import { requestInvoke, createToolsHost, normalizeCreatorSchema } from '../server.toolsHost';
import { isZodSchema } from '../server.schema';

describe('normalizeCreatorSchema', () => {
  it.each([
    {
      description: 'with undefined name, schema',
      creator: () => [
        undefined,
        undefined,
        () => null
      ]
    },
    {
      description: 'with undefined name',
      creator: () => [
        undefined,
        {
          description: 'lorem ipsum',
          inputSchema: { type: 'object', additionalProperties: true }
        },
        () => null
      ]
    },
    {
      description: 'with undefined schema',
      creator: () => [
        'lorem ipsum',
        undefined,
        () => null
      ]
    },
    {
      description: 'with partial',
      creator: () => [
        'lorem ipsum',
        {
          description: 'lorem ipsum',
          inputSchema: undefined
        },
        () => null
      ]
    },
    {
      description: 'with JSON inputSchema',
      creator: () => [
        'lorem ipsum',
        {
          description: 'lorem ipsum',
          inputSchema: { type: 'object', additionalProperties: true }
        },
        () => null
      ]
    },
    {
      description: 'with invalid JSON inputSchema',
      creator: () => [
        'lorem ipsum',
        {
          description: 'lorem ipsum',
          inputSchema: { type: 'object', additionalProperties: 'busted' }
        },
        () => null
      ]
    },
    {
      description: 'with valid zod inputSchema',
      creator: () => [
        'lorem ipsum',
        {
          description: 'lorem ipsum',
          inputSchema: z.any()
        },
        () => null
      ]
    }
  ])('should attempt to normalize a schema, $description', ({ creator }) => {
    const { normalizedSchema, tool, ...rest } = normalizeCreatorSchema(creator);

    expect({
      normalizedSchema: `${normalizedSchema}, isZod=${isZodSchema(normalizedSchema)}`,
      tool: [
        tool[0],
        {
          description: tool[1]?.description,
          inputSchema: `${tool[1]?.inputSchema}, isZod=${isZodSchema(tool[1]?.inputSchema)}`
        },
        tool[2]
      ],
      ...rest
    }).toMatchSnapshot();
  });
});

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
      stateToolId: 'tool-1',
      requestToolId: 'tool-1'
    },
    {
      description: 'handler returning promise',
      handlerResult: Promise.resolve({ data: 'async-result' }),
      stateToolId: 'tool-1',
      requestToolId: 'tool-1'
    },
    {
      description: 'handler throwing error',
      handlerResult: Promise.reject(new Error('Handler error')),
      stateToolId: 'tool-1',
      requestToolId: 'tool-1'
    },
    {
      description: 'handler returning error',
      handlerResult: new Error('Handler error'),
      stateToolId: 'tool-1',
      requestToolId: 'tool-1'
    },
    {
      description: 'mismatched state and request tool IDs',
      handlerResult: { data: 'result' },
      stateToolId: 'tool-1',
      requestToolId: 'tool-2'
    },
    {
      description: 'handler returning AggregateError',
      handlerResult: new AggregateError(['Handler error']),
      stateToolId: 'tool-1',
      requestToolId: 'tool-1'
    },
    {
      description: 'handler attempting to return an error-like object, with message',
      handlerResult: { message: 'Handler error' },
      stateToolId: 'tool-1',
      requestToolId: 'tool-1'
    },
    {
      description: 'handler attempting to return an error-like object, with single line stack',
      handlerResult: { message: 'Handler error', stack: 'Stack trace' },
      stateToolId: 'tool-1',
      requestToolId: 'tool-1'
    },
    {
      description: 'handler attempting to return an error-like object, with name and single line stack',
      handlerResult: { name: 'Mock ERROR', message: 'Handler error', stack: 'Stack trace' },
      stateToolId: 'tool-1',
      requestToolId: 'tool-1'
    },
    {
      description: 'handler attempting to return an error-like object, with name and multiline line stack',
      handlerResult: { name: 'Mock', message: 'Handler error', stack: 'Stack trace\nSecond line' },
      stateToolId: 'tool-1',
      requestToolId: 'tool-1'
    },
    {
      description: 'handler attempting to return a DOMException-like object, with name, message and multiline line stack',
      handlerResult: { name: 'DOMException', message: 'Handler error', stack: 'DOMException: message\n at line x' },
      stateToolId: 'tool-1',
      requestToolId: 'tool-1'
    },
    {
      description: 'handler attempting to return a browser-like ErrorEvent-like object, with name, message and multiline line stack',
      handlerResult: { name: 'ErrorEvent', message: 'Handler error', stack: 'ErrorEvent: message\n at line x' },
      stateToolId: 'tool-1',
      requestToolId: 'tool-1'
    },
    {
      description: 'handler returning undefined',
      handlerResult: undefined,
      stateToolId: 'tool-1',
      requestToolId: 'tool-1'
    },
    {
      description: 'handler returning null',
      handlerResult: null,
      stateToolId: 'tool-1',
      requestToolId: 'tool-1'
    }
  ])('should attempt tool invocation, $description', async ({ handlerResult, stateToolId, requestToolId }) => {
    const mockState = {
      toolMap: new Map(),
      descriptors: [
        {
          id: stateToolId,
          name: 'ToolName',
          description: 'Tool description 1',
          inputSchema: {},
          source: 'module1'
        }
      ],
      invokeTimeoutMs: 1000
    };

    mockState.toolMap.set(
      stateToolId,
      [
        'ToolName',
        { description: 'Tool description 1', inputSchema: {} },
        jest.fn().mockImplementation(async () => handlerResult)
      ]
    );

    const ctx = { send: jest.fn() };
    const promise = requestInvoke(mockState as any, { t: 'invoke', id: 'request-id', toolId: requestToolId, args: { param: 'value' } }, ctx);

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
    const stateToolId = 'tool-1';
    const requestToolId = 'tool-1';
    const mockState = {
      toolMap: new Map(),
      descriptors: [
        {
          id: stateToolId,
          name: 'ToolName',
          description: 'Tool description 1',
          inputSchema: {},
          source: 'module1'
        }
      ],
      invokeTimeoutMs: 100
    };

    // Create a handler that resolves after timeout would fire
    const handler = jest.fn(() => new Promise(resolve => {
      setTimeout(resolve, 101);
    }));

    mockState.toolMap.set(
      stateToolId,
      [
        'ToolName',
        { description: 'Tool description 1', inputSchema: {} },
        handler
      ]
    );

    const ctx = { send: jest.fn() };
    const invokePromise = requestInvoke(mockState, { t: 'invoke', id: 'request-id', toolId: requestToolId, args: {} }, ctx);

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

describe('createToolsHost', () => {
  it('should route load then reply with load:ack via the host', async () => {
    const sendSpy = jest.fn();

    (process as any).send = sendSpy;
    const { bootstrapMessage } = createToolsHost();

    await bootstrapMessage({ t: 'load', id: 'L1', specs: [] } as any);

    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({ t: 'load:ack', id: 'L1', warnings: [], errors: [] })
    );
  });
});
