import { setHandlers, createProcessHost, helloHandler, shutdownHandler } from '../server.processHost';

describe('server.processHost', () => {
  let messageHandlers: Array<(m: any) => void>;
  let disconnectHandlers: Array<() => void>;
  let sendSpy: jest.Mock;
  let exitSpy: jest.SpyInstance;
  const originalSend = process.send;

  beforeEach(() => {
    messageHandlers = [];
    disconnectHandlers = [];
    sendSpy = jest.fn();
    (process as any).send = sendSpy;
    jest.spyOn(process, 'on').mockImplementation((event: any, handler: any) => {
      if (event === 'message') {
        messageHandlers.push(handler);
      }
      if (event === 'disconnect') {
        disconnectHandlers.push(handler);
      }

      return process;
    });
    jest.spyOn(process, 'off').mockImplementation(() => process);
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    (process as any).send = originalSend;
  });

  it('should route messages to the matching handler', async () => {
    const load = jest.fn();

    setHandlers({ load });
    await (messageHandlers[0] as any)({ t: 'load', id: '1' });

    expect(load).toHaveBeenCalledWith({ t: 'load', id: '1' }, expect.objectContaining({ send: expect.any(Function) }));
  });

  it('should reply to the built-in hello handler', async () => {
    setHandlers({});
    await (messageHandlers[0] as any)({ t: 'hello', id: 'h1' });

    expect(sendSpy).toHaveBeenCalledWith({ t: 'hello:ack', id: 'h1' });
  });

  it('should ignore unknown message types', async () => {
    setHandlers({});
    await (messageHandlers[0] as any)({ t: 'nope', id: 'x' });

    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('should route thrown handler errors through requestFallback', async () => {
    setHandlers({
      lorem: () => {
        throw new Error('bad');
      }
    });
    await (messageHandlers[0] as any)({ t: 'lorem', id: 'b1' });

    expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({
      t: 'lorem:error', id: 'b1', ok: false, error: expect.objectContaining({ message: 'bad' })
    }));
  });

  it('should exit on disconnect', () => {
    setHandlers({});
    (disconnectHandlers[0] as any)();

    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('should ack and exit on the built-in shutdown handler', async () => {
    setHandlers({});
    const handler = messageHandlers[0] as any;

    await handler({ t: 'shutdown', id: 's1' });

    expect(sendSpy).toHaveBeenCalledWith({ t: 'shutdown:ack', id: 's1' });
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('shutdownHandler should ack via ctx.send then exit', async () => {
    const send = jest.fn();

    shutdownHandler({ t: 'shutdown', id: 'q' }, { send });

    expect(send).toHaveBeenCalledWith({ t: 'shutdown:ack', id: 'q' });
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('should one-shot bootstrap: detach then route the first message', async () => {
    const load = jest.fn();
    const { bootstrapMessage } = createProcessHost({ load });

    await bootstrapMessage({ t: 'load', id: 'first' } as any);

    expect(process.off).toHaveBeenCalledWith('message', bootstrapMessage);
    expect(load).toHaveBeenCalledWith({ t: 'load', id: 'first' }, expect.anything());
  });

  it('should auto-attach the bootstrap listener once when process.send exists', () => {
    const { bootstrapMessage } = createProcessHost({});
    const mockOn = process.on as jest.Mock;

    expect(mockOn).toHaveBeenCalledWith('message', bootstrapMessage);
    expect(mockOn.mock.calls.filter(([event]) => event === 'message')).toHaveLength(1);
  });

  it('helloHandler should ack via ctx.send', () => {
    const send = jest.fn();

    helloHandler({ t: 'hello', id: 'z' }, { send });

    expect(send).toHaveBeenCalledWith({ t: 'hello:ack', id: 'z' });
  });

  it('should detach the prior bootstrap when instantiated again', () => {
    const first = createProcessHost({}).bootstrapMessage;
    const second = createProcessHost({}).bootstrapMessage;

    // The earlier bootstrap is removed before the new one is attached.
    expect(process.off).toHaveBeenCalledWith('message', first);
    // Only the latest bootstrap remains attached.
    const attached = (process.on as jest.Mock).mock.calls.filter(([event]) => event === 'message');

    expect(attached[attached.length - 1][1]).toBe(second);
  });
});
