import { type ChildProcess } from 'node:child_process';
import {
  send,
  awaitIpc,
  isHelloAck,
  isLoadAck,
  isManifestResult,
  isInvokeResult,
  type IpcRequest,
  type IpcResponse
} from '../server.toolsIpc';

describe('send', () => {
  let mockProcess: NodeJS.Process;
  let mockChildProcess: ChildProcess;

  beforeEach(() => {
    mockProcess = {
      send: jest.fn().mockReturnValue(true)
    } as any;

    mockChildProcess = {
      send: jest.fn().mockReturnValue(true)
    } as any;
  });

  it.each([
    {
      description: 'hello request',
      request: { t: 'hello', id: 'test-id' }
    },
    {
      description: 'load request',
      request: { t: 'load', id: 'test-id', specs: ['module1', 'module2'] }
    },
    {
      description: 'load request with invokeTimeoutMs',
      request: { t: 'load', id: 'test-id', specs: ['module1'], invokeTimeoutMs: 5000 }
    },
    {
      description: 'manifest:get request',
      request: { t: 'manifest:get', id: 'test-id' }
    },
    {
      description: 'invoke request',
      request: { t: 'invoke', id: 'test-id', toolId: 'tool1', args: { param: 'value' } }
    },
    {
      description: 'shutdown request',
      request: { t: 'shutdown', id: 'test-id' }
    }
  ])('should send IPC message, $description', ({ request }) => {
    const result = send(mockProcess, request as IpcRequest);

    expect(result).toBe(true);
    expect(mockProcess.send).toHaveBeenCalledTimes(1);
    expect(mockProcess.send).toHaveBeenCalledWith(request);

    const childResult = send(mockChildProcess, request as IpcRequest);

    expect(childResult).toBe(true);
    expect(mockChildProcess.send).toHaveBeenCalledTimes(1);
    expect(mockChildProcess.send).toHaveBeenCalledWith(request);
  });

  it.each([
    {
      description: 'process without send',
      process: {}
    },
    {
      description: 'process with send returning false',
      process: {
        send: jest.fn().mockReturnValue(false)
      }
    }
  ])('should return false, $description', ({ process }) => {
    const result = send(process as any, { t: 'hello', id: 'test-id' });

    expect(result).toBe(false);
  });
});

describe('isHelloAck', () => {
  it.each([
    {
      description: 'valid hello:ack message',
      message: { t: 'hello:ack', id: 'test-id' },
      expected: true
    },
    {
      description: 'invalid type',
      message: { t: 'hello', id: 'test-id' },
      expected: false
    },
    {
      description: 'missing type',
      message: { id: 'test-id' },
      expected: false
    },
    {
      description: 'missing id',
      message: { t: 'hello:ack' },
      expected: false
    },
    {
      description: 'non-string id',
      message: { t: 'hello:ack', id: 123 },
      expected: false
    },
    {
      description: 'null message',
      message: null,
      expected: false
    },
    {
      description: 'undefined message',
      message: undefined,
      expected: false
    },
    {
      description: 'empty object',
      message: {},
      expected: false
    }
  ])('should check if message is hello:ack, $description', ({ message, expected }) => {
    expect(isHelloAck(message)).toBe(expected);
  });
});

describe('isLoadAck', () => {
  it.each([
    {
      description: 'valid load:ack message with matching id',
      message: { t: 'load:ack', id: 'test-id', warnings: [], errors: [] },
      expectedId: 'test-id',
      expected: true
    },
    {
      description: 'valid load:ack with warnings and errors',
      message: { t: 'load:ack', id: 'test-id', warnings: ['warning1'], errors: ['error1'] },
      expectedId: 'test-id',
      expected: true
    },
    {
      description: 'mismatched id',
      message: { t: 'load:ack', id: 'other-id', warnings: [], errors: [] },
      expectedId: 'test-id',
      expected: false
    },
    {
      description: 'invalid type',
      message: { t: 'load', id: 'test-id', warnings: [], errors: [] },
      expectedId: 'test-id',
      expected: false
    },
    {
      description: 'missing warnings',
      message: { t: 'load:ack', id: 'test-id', errors: [] },
      expectedId: 'test-id',
      expected: false
    },
    {
      description: 'missing errors',
      message: { t: 'load:ack', id: 'test-id', warnings: [] },
      expectedId: 'test-id',
      expected: false
    },
    {
      description: 'non-array warnings',
      message: { t: 'load:ack', id: 'test-id', warnings: 'not-array', errors: [] },
      expectedId: 'test-id',
      expected: false
    },
    {
      description: 'non-array errors',
      message: { t: 'load:ack', id: 'test-id', warnings: [], errors: 'not-array' },
      expectedId: 'test-id',
      expected: false
    },
    {
      description: 'null message',
      message: null,
      expectedId: 'test-id',
      expected: false
    },
    {
      description: 'undefined message',
      message: undefined,
      expectedId: 'test-id',
      expected: false
    }
  ])('should check if message is load:ack, $description', ({ message, expectedId, expected }) => {
    const matcher = isLoadAck(expectedId);

    expect(matcher(message)).toBe(expected);
  });
});

describe('isManifestResult', () => {
  it.each([
    {
      description: 'valid manifest:result with matching id',
      message: { t: 'manifest:result', id: 'test-id', tools: [] },
      expectedId: 'test-id',
      expected: true
    },
    {
      description: 'valid manifest:result with tools',
      message: {
        t: 'manifest:result',
        id: 'test-id',
        tools: [
          { id: 'tool1', name: 'Tool1', description: 'Description', inputSchema: {} }
        ]
      },
      expectedId: 'test-id',
      expected: true
    },
    {
      description: 'mismatched id',
      message: { t: 'manifest:result', id: 'other-id', tools: [] },
      expectedId: 'test-id',
      expected: false
    },
    {
      description: 'invalid type',
      message: { t: 'manifest', id: 'test-id', tools: [] },
      expectedId: 'test-id',
      expected: false
    },
    {
      description: 'missing tools',
      message: { t: 'manifest:result', id: 'test-id' },
      expectedId: 'test-id',
      expected: false
    },
    {
      description: 'non-array tools',
      message: { t: 'manifest:result', id: 'test-id', tools: 'not-array' },
      expectedId: 'test-id',
      expected: false
    },
    {
      description: 'null message',
      message: null,
      expectedId: 'test-id',
      expected: false
    },
    {
      description: 'undefined message',
      message: undefined,
      expectedId: 'test-id',
      expected: false
    }
  ])('should check if message is manifest:result, $description', ({ message, expectedId, expected }) => {
    const matcher = isManifestResult(expectedId);

    expect(matcher(message)).toBe(expected);
  });
});

describe('isInvokeResult', () => {
  it.each([
    {
      description: 'valid invoke:result with ok:true and matching id',
      message: { t: 'invoke:result', id: 'test-id', ok: true, result: { data: 'value' } },
      expectedId: 'test-id',
      expected: true
    },
    {
      description: 'valid invoke:result with ok:false and error',
      message: {
        t: 'invoke:result',
        id: 'test-id',
        ok: false,
        error: { message: 'Error message', stack: 'stack trace', code: 'ERROR_CODE' }
      },
      expectedId: 'test-id',
      expected: true
    },
    {
      description: 'mismatched id',
      message: { t: 'invoke:result', id: 'other-id', ok: true, result: {} },
      expectedId: 'test-id',
      expected: false
    },
    {
      description: 'invalid type',
      message: { t: 'invoke', id: 'test-id', ok: true, result: {} },
      expectedId: 'test-id',
      expected: false
    },
    {
      description: 'missing id',
      message: { t: 'invoke:result', ok: true, result: {} },
      expectedId: 'test-id',
      expected: false
    },
    {
      description: 'null message',
      message: null,
      expectedId: 'test-id',
      expected: false
    },
    {
      description: 'undefined message',
      message: undefined,
      expectedId: 'test-id',
      expected: false
    }
  ])('should check if message is invoke:result, $description', ({ message, expectedId, expected }) => {
    const matcher = isInvokeResult(expectedId);

    expect(matcher(message)).toBe(expected);
  });
});

describe('awaitIpc', () => {
  let mockProcess: NodeJS.Process;
  let messageHandlers: Array<(message: any) => void>;
  let exitHandlers: Array<(code?: number, signal?: string) => void>;
  let disconnectHandlers: Array<() => void>;

  beforeEach(() => {
    messageHandlers = [];
    exitHandlers = [];
    disconnectHandlers = [];

    mockProcess = {
      on: jest.fn((event: string, handler: any) => {
        switch (event) {
          case 'message':
            messageHandlers.push(handler);
            break;
          case 'exit':
            exitHandlers.push(handler);
            break;
          case 'disconnect':
            disconnectHandlers.push(handler);
            break;
        }

        return mockProcess;
      }),
      off: jest.fn((event: string, handler: any) => {
        switch (event) {
          case 'message': {
            const index = messageHandlers.indexOf(handler);

            if (index > -1) {
              messageHandlers.splice(index, 1);
            }
            break;
          }
          case 'exit': {
            const index = exitHandlers.indexOf(handler);

            if (index > -1) {
              exitHandlers.splice(index, 1);
            }
            break;
          }
          case 'disconnect': {
            const index = disconnectHandlers.indexOf(handler);

            if (index > -1) {
              disconnectHandlers.splice(index, 1);
            }
            break;
          }
        }

        return mockProcess;
      })
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    {
      description: 'hello:ack message',
      response: { t: 'hello:ack', id: 'test-id' }
    },
    {
      description: 'load:ack message',
      response: { t: 'load:ack', id: 'test-id', warnings: [], errors: [] }
    },
    {
      description: 'manifest:result message',
      response: { t: 'manifest:result', id: 'test-id', tools: [] }
    },
    {
      description: 'invoke:result with ok:true',
      response: { t: 'invoke:result', id: 'test-id', ok: true, result: { data: 'value' } }
    },
    {
      description: 'invoke:result with ok:false',
      response: { t: 'invoke:result', id: 'test-id', ok: false, error: { message: 'Error' } }
    }
  ])('should await and resolve IPC response, $description', async ({ response }) => {
    let promise: Promise<IpcResponse>;

    switch (response.t) {
      case 'hello:ack':
        promise = awaitIpc(mockProcess, isHelloAck, 1000);
        break;
      case 'load:ack':
        promise = awaitIpc(mockProcess, isLoadAck(response.id), 1000);
        break;
      case 'manifest:result':
        promise = awaitIpc(mockProcess, isManifestResult(response.id), 1000);
        break;
      default:
        promise = awaitIpc(mockProcess, isInvokeResult(response.id), 1000);
        break;
    }

    // Simulate message arrival, wait for handlers to be registered
    await Promise.resolve();
    messageHandlers.forEach(handler => handler(response));

    const result = await promise;

    expect(result).toEqual(response);
    expect(mockProcess.on).toHaveBeenCalledWith('message', expect.any(Function));
    expect(mockProcess.on).toHaveBeenCalledWith('exit', expect.any(Function));
    expect(mockProcess.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
  });

  it('should ignore non-matching messages and only resolve once', async () => {
    const responseOne = { t: 'hello:ack', id: 'test-id-1' };
    const responseTwo = { t: 'other:type', id: 'test-id-2' };
    const responseThree = { t: 'hello:ack', id: 'test-id-2' };

    const promise = awaitIpc(mockProcess, isHelloAck, 1000);

    // Simulate message arrival, wait for handlers to be registered
    await Promise.resolve();
    messageHandlers.forEach(handler => handler(responseTwo));

    await Promise.resolve();
    messageHandlers.forEach(handler => handler(responseOne));

    await Promise.resolve();
    messageHandlers.forEach(handler => handler(responseThree));

    const result = await promise;

    expect(result).toEqual(responseOne);
  });

  it('should reject when process exits', async () => {
    const exit = { event: 'exit', code: 1, signal: 'SIGTERM' };

    const promise = awaitIpc(mockProcess, isHelloAck, 1000);

    // Simulate message arrival, wait for handlers to be registered
    await Promise.resolve();
    exitHandlers.forEach(handler => handler(exit.code, exit.signal));

    await expect(promise).rejects.toThrow('Tools Host exited before response');
  });

  it('should reject on timeout', async () => {
    jest.useFakeTimers();
    const promise = awaitIpc(mockProcess, isHelloAck, 1000);

    jest.advanceTimersByTime(1001);

    await expect(promise).rejects.toThrow('Timed out waiting for IPC response');
    jest.useRealTimers();
  });

  it('should cleanup event listeners on resolve', async () => {
    const response = { t: 'hello:ack', id: 'test-id' };
    const promise = awaitIpc(mockProcess, isHelloAck, 1000);

    // Simulate message arrival, wait for handlers to be registered
    await Promise.resolve();
    messageHandlers.forEach(handler => handler(response));

    await promise;

    expect(mockProcess.off).toHaveBeenCalledWith('message', expect.any(Function));
    expect(mockProcess.off).toHaveBeenCalledWith('exit', expect.any(Function));
    expect(mockProcess.off).toHaveBeenCalledWith('disconnect', expect.any(Function));
  });

  it('should cleanup event listeners on reject', async () => {
    jest.useFakeTimers();
    const promise = awaitIpc(mockProcess, isHelloAck, 1000);

    jest.advanceTimersByTime(1001);

    try {
      await promise;
    } catch {
      // Expected to reject
    }
    jest.useRealTimers();

    expect(mockProcess.off).toHaveBeenCalledWith('message', expect.any(Function));
    expect(mockProcess.off).toHaveBeenCalledWith('exit', expect.any(Function));
    expect(mockProcess.off).toHaveBeenCalledWith('disconnect', expect.any(Function));
  });
});
