import { z } from 'zod';
import {
  normalizeCreatorSchema,
  requestHello,
  requestLoad,
  requestManifestGet,
  requestInvoke,
  requestShutdown,
  requestFallback,
  setHandlers
} from '../server.toolsHost';
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

describe('requestHello', () => {
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
      description: 'with valid request',
      request: { t: 'hello', id: 'test-id-1' }
    },
    {
      description: 'with different id',
      request: { t: 'hello', id: 'test-id-2' }
    }
  ])('should send hello:ack message, $description', ({ request }) => {
    requestHello(request as any);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls).toMatchSnapshot();
  });

  it('should not throw when process.send is undefined', () => {
    delete (process as any).send;

    expect(() => {
      requestHello({ t: 'hello', id: 'test-id' });
    }).not.toThrow();
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

    const promise = requestInvoke(mockState as any, { t: 'invoke', id: 'request-id', toolId: requestToolId, args: { param: 'value' } });

    await promise;

    expect(mockSend.mock.calls.length).toBe(1);

    const { error, ...rest } = mockSend.mock.calls[0][0];

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

    const invokePromise = requestInvoke(mockState, { t: 'invoke', id: 'request-id', toolId: requestToolId, args: {} });

    // Wait for handler to be called, timeout to be set up
    await Promise.resolve();

    // Advance timers past timeout
    jest.advanceTimersByTime(102);

    // Wait for the timeout message to be sent
    await Promise.resolve();

    // Verify timeout message was sent
    expect(mockSend.mock.calls).toMatchSnapshot();

    // Wait for the function to complete
    await invokePromise;

    expect(mockSend).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});

describe('requestLoad', () => {
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
      description: 'with warnings and errors',
      request: { t: 'load', id: 'test-id', specs: [] },
      warnings: ['warning1', 'warning2'],
      errors: ['error1']
    },
    {
      description: 'with empty warnings and errors',
      request: { t: 'load', id: 'test-id', specs: [] },
      warnings: [],
      errors: []
    },
    {
      description: 'with only warnings',
      request: { t: 'load', id: 'test-id', specs: [] },
      warnings: ['warning1'],
      errors: []
    },
    {
      description: 'with only errors',
      request: { t: 'load', id: 'test-id', specs: [] },
      warnings: [],
      errors: ['error1']
    },
    {
      description: 'with undefined warnings and errors',
      request: { t: 'load', id: 'test-id', specs: [] },
      warnings: undefined,
      errors: undefined
    }
  ])('should send load:ack message, $description', ({ request, warnings, errors }) => {
    const options: { warnings?: string[]; errors?: string[] } = {};

    if (warnings !== undefined) {
      options.warnings = warnings;
    }
    if (errors !== undefined) {
      options.errors = errors;
    }
    requestLoad(request as any, options);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls).toMatchSnapshot();
  });

  it('should not throw when process.send is undefined', () => {
    delete (process as any).send;

    expect(() => {
      requestLoad({ t: 'load', id: 'test-id', specs: [] }, {});
    }).not.toThrow();
  });
});

describe('requestManifestGet', () => {
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
      description: 'with empty descriptors',
      state: {
        toolMap: new Map(),
        descriptors: [],
        invokeTimeoutMs: 1000
      },
      request: { t: 'manifest:get', id: 'test-id' }
    },
    {
      description: 'with single tool descriptor',
      state: {
        toolMap: new Map(),
        descriptors: [
          {
            id: 'tool-1',
            name: 'Tool1',
            description: 'Description 1',
            inputSchema: {},
            source: 'module1'
          }
        ],
        invokeTimeoutMs: 1000
      },
      request: { t: 'manifest:get', id: 'test-id' }
    },
    {
      description: 'with multiple tool descriptors',
      state: {
        toolMap: new Map(),
        descriptors: [
          {
            id: 'tool-1',
            name: 'Tool1',
            description: 'Description 1',
            inputSchema: { type: 'object' },
            source: 'module1'
          },
          {
            id: 'tool-2',
            name: 'Tool2',
            description: 'Description 2',
            inputSchema: {},
            source: 'module2'
          }
        ],
        invokeTimeoutMs: 1000
      },
      request: { t: 'manifest:get', id: 'test-id' }
    }
  ])('should send manifest:result message, $description', ({ state, request }) => {
    requestManifestGet(state, request as any);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls).toMatchSnapshot();
  });

  it('should not throw when process.send is undefined', () => {
    const mockHostState = {
      toolMap: new Map(),
      descriptors: [],
      invokeTimeoutMs: 1000
    };

    delete (process as any).send;

    expect(() => {
      requestManifestGet(mockHostState, { t: 'manifest:get', id: 'test-id' });
    }).not.toThrow();
  });
});

describe('requestShutdown', () => {
  let mockSend: jest.Mock;
  let mockExit: jest.Mock;

  beforeEach(() => {
    mockSend = jest.fn();
    mockExit = jest.fn();
    process.send = mockSend;
    process.exit = mockExit as any;
  });

  afterEach(() => {
    delete (process as any).send;
    delete (process as any).exit;
    jest.clearAllMocks();
  });

  it.each([
    {
      description: 'with valid request',
      request: { t: 'shutdown', id: 'test-id-1' }
    },
    {
      description: 'with different id',
      request: { t: 'shutdown', id: 'test-id-2' }
    }
  ])('should send shutdown:ack and exit, $description', ({ request }) => {
    requestShutdown(request as any);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls).toMatchSnapshot();
    expect(mockExit).toHaveBeenCalledTimes(1);
    expect(mockExit).toHaveBeenCalledWith(0);
  });
});

describe('requestFallback', () => {
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
      description: 'with request id',
      request: { t: 'hello', id: 'test-id' },
      error: new Error('Test error')
    },
    {
      description: 'without request id',
      request: { t: 'load', id: '', specs: [] },
      error: new Error('Test error')
    },
    {
      description: 'with string error',
      request: { t: 'invoke', id: 'test-id', toolId: 'tool', args: {} },
      error: 'String error'
    }
  ])('should send error response, $description', ({ request, error }) => {
    requestFallback(request as any, error as Error);

    expect(mockSend).toHaveBeenCalledTimes(1);

    const { error: err, ...rest } = mockSend.mock.calls[0][0];

    expect({
      ...rest,
      error: err?.message
    }).toMatchSnapshot();
  });

  it('should not throw when process.send is undefined', () => {
    delete (process as any).send;

    expect(() => {
      requestFallback({ t: 'hello', id: 'test-id' }, new Error('Test'));
    }).not.toThrow();
  });

  it('should not throw when send throws', () => {
    mockSend.mockImplementation(() => {
      throw new Error('Send failed');
    });

    expect(() => {
      requestFallback({ t: 'hello', id: 'test-id' }, new Error('Test'));
    }).not.toThrow();
  });
});

describe('setHandlers', () => {
  let mockOn: jest.Mock;
  let mockSend: jest.Mock;

  beforeEach(() => {
    mockSend = jest.fn();
    mockOn = jest.fn();

    process.on = mockOn;
    process.send = mockSend;
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete (process as any).send;
  });

  it.each([
    {
      description: 'hello',
      request: { t: 'hello', id: 'test-id' }
    },
    {
      description: 'load',
      request: { t: 'load', id: 'test-id' }
    },
    {
      description: 'manifest:get',
      request: { t: 'manifest:get', id: 'test-id' }
    },
    {
      description: 'invoke',
      request: { t: 'invoke', id: 'test-id' }
    }
  ])('should set up message handlers and attempt handle requests, $description', async ({ request }) => {
    const handler = setHandlers();

    await handler(request as any);

    expect(mockOn).toHaveBeenCalledWith('message', expect.any(Function));
    expect(mockSend.mock.calls).toMatchSnapshot();
  });
});
