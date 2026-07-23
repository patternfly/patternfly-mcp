import {
  send,
  awaitIpc,
  makeId,
  matchResponse,
  serializeError,
  type ProcessRequest,
  type ProcessResponse
} from '../server.processIpc';

describe('makeId', () => {
  it('should generate unique ids', () => {
    const ids = new Set(Array.from({ length: 100 }, () => makeId()));

    expect(ids.size).toBe(100);
  });
});

describe('send', () => {
  let mockProcess: NodeJS.Process;

  beforeEach(() => {
    mockProcess = { send: jest.fn().mockReturnValue(true) } as any;
  });

  it.each([
    { description: 'send returns true', process: { send: jest.fn().mockReturnValue(true) }, expected: true },
    { description: 'send returns false', process: { send: jest.fn().mockReturnValue(false) }, expected: false },
    { description: 'no send method', process: {}, expected: false }
  ])('should return $expected, $description', ({ process, expected }) => {
    expect(send(process as any, { t: 'hello', id: 'id' })).toBe(expected);
  });

  it('should forward the request payload', () => {
    const request: ProcessRequest = { t: 'hello', id: 'id' };

    send(mockProcess, request);

    expect(mockProcess.send).toHaveBeenCalledWith(request);
  });
});

describe('matchResponse', () => {
  it.each([
    { description: 'type + id match', type: 'x:ack', id: 'a', message: { t: 'x:ack', id: 'a' }, expected: true },
    { description: 'type mismatch', type: 'x:ack', id: 'a', message: { t: 'y', id: 'a' }, expected: false },
    { description: 'id mismatch', type: 'x:ack', id: 'a', message: { t: 'x:ack', id: 'b' }, expected: false },
    { description: 'no id constraint', type: 'x:ack', id: undefined, message: { t: 'x:ack', id: 'z' }, expected: true },
    { description: 'no id constraint, non-string id', type: 'x:ack', id: undefined, message: { t: 'x:ack', id: 5 }, expected: false },
    { description: 'null message', type: 'x:ack', id: 'a', message: null, expected: false }
  ])('should match, $description', ({ type, id, message, expected }) => {
    expect(matchResponse(type, id as any)(message)).toBe(expected);
  });
});

describe('serializeError', () => {
  it('should serialize an Error instance', () => {
    const err: any = new Error('lorem');

    err.code = 'E_IPSUM';

    const out = serializeError(err);

    expect(out.message).toBe('lorem');
    expect(out.code).toBe('E_IPSUM');
    expect(typeof out.stack).toBe('string');
  });

  it('should serialize a non-error value', () => {
    expect(serializeError('dolor').message).toBe('dolor');
  });

  it('should always emit the optional keys uniformly', () => {
    const out = serializeError(new Error('lorem'));

    expect(Object.keys(out).sort()).toEqual(expect.arrayContaining(['cause', 'code', 'details', 'message', 'stack']));
  });
});

describe('awaitIpc', () => {
  let mockProcess: NodeJS.Process;
  let messageHandlers: Array<(m: any) => void>;
  let exitHandlers: Array<(c?: number, s?: string) => void>;

  beforeEach(() => {
    messageHandlers = [];
    exitHandlers = [];
    mockProcess = {
      on: jest.fn((event: string, handler: any) => {
        if (event === 'message') {
          messageHandlers.push(handler);
        }
        if (event === 'exit' || event === 'disconnect') {
          exitHandlers.push(handler);
        }

        return mockProcess;
      }),
      off: jest.fn(() => mockProcess)
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should resolve on a matching message and clean up', async () => {
    const promise = awaitIpc<ProcessResponse>(mockProcess, matchResponse('x:ack', 'id'), 1000);

    await Promise.resolve();
    messageHandlers.forEach(handler => handler({ t: 'x:ack', id: 'id' }));

    await expect(promise).resolves.toEqual({ t: 'x:ack', id: 'id' });
    expect(mockProcess.off).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('should reject on early exit', async () => {
    const promise = awaitIpc<ProcessResponse>(mockProcess, matchResponse('x:ack', 'id'), 1000);

    await Promise.resolve();
    exitHandlers.forEach(handler => handler(1, 'SIGKILL'));

    await expect(promise).rejects.toThrow('exited before response');
  });

  it('should reject on timeout', async () => {
    jest.useFakeTimers();
    const promise = awaitIpc<ProcessResponse>(mockProcess, matchResponse('x:ack', 'id'), 50);

    jest.advanceTimersByTime(60);

    await expect(promise).rejects.toThrow('Timed out');
    jest.useRealTimers();
  });
});
