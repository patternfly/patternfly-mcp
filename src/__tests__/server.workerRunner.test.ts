import { executeTask, keepWorkerAlive, runWorker } from '../server.workerRunner';

const mockParentPort = {
  postMessage: jest.fn(),
  on: jest.fn(),
  ref: jest.fn(),
  unref: jest.fn()
};
const mockWorkerData = jest.fn(() => null);

jest.mock('node:worker_threads', () => ({
  get parentPort() {
    return mockParentPort;
  },
  get workerData() {
    return mockWorkerData();
  }
}));

jest.mock('../options.context', () => ({
  runWithOptions: jest.fn(),
  runWithSession: jest.fn()
}));

describe('executeTask', () => {
  let mockRunWithOptions: any;
  let mockRunWithSession: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const options = await import('../options.context');

    mockRunWithOptions = jest.mocked(options.runWithOptions).mockImplementation((_options, callback: any) => callback());
    mockRunWithSession = jest.mocked(options.runWithSession).mockImplementation((_options, callback: any) => callback());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('throws when moduleSpecifier is missing', async () => {
    await expect(executeTask({} as any)).rejects.toThrow(
      'No moduleSpecifier specified for worker task.'
    );
  });

  it.each([
    {
      description: 'default',
      payload: {
        exportName: 'default'
      }
    },
    {
      description: 'named',
      payload: {
        exportName: 'loremIpsum'
      }
    }
  ])('should invoke export payload, $description', async ({ payload }) => {
    const mockFunc = jest.fn().mockReturnValue('ok');

    const mockPayload = {
      moduleSpecifier: '/abs/path/to/task.mjs',
      args: { a: 1 },
      options: { o: true },
      session: { s: 2 },
      ...payload
    };

    jest.spyOn(global as any, 'Function').mockReturnValue(() =>
      Promise.resolve({ [payload.exportName || 'default']: mockFunc }));

    const result = await executeTask(mockPayload as any);

    expect(mockFunc).toHaveBeenCalledTimes(1);
    expect(mockFunc).toHaveBeenCalledWith(mockPayload.args);
    expect(mockRunWithOptions).toHaveBeenCalledWith(mockPayload.options, expect.any(Function));
    expect(mockRunWithSession).toHaveBeenCalledWith(mockPayload.session, expect.any(Function));
    expect(result).toBe('ok');
  });

  it('should throw if export is not a function', async () => {
    jest.spyOn(global as any, 'Function').mockReturnValue(() =>
      Promise.resolve({ default: 123 }));

    await expect(
      executeTask({ moduleSpecifier: '/dolorSit.mjs' } as any)
    ).rejects.toThrow("Exported module '/dolorSit.mjs' (export: 'default') must be a function.");
  });
});

describe('keepWorkerAlive', () => {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    (global as any).setTimeout = originalSetTimeout;
    (global as any).clearTimeout = originalClearTimeout;
  });

  it('should pin parentPort via ref() and return an unref() cleanup handler', () => {
    const release = keepWorkerAlive();

    expect(mockParentPort.ref).toHaveBeenCalledTimes(1);
    expect(mockParentPort.unref).not.toHaveBeenCalled();

    release();

    expect(mockParentPort.unref).toHaveBeenCalledTimes(1);
  });

  it('should throw by default when parentPort.ref is not a function', () => {
    (mockParentPort as any).ref = undefined;

    expect(() => keepWorkerAlive()).toThrow('parentPort.ref is not a function — worker keep-alive failed');
  });

  it('should fall back to a setTimeout and return a cleanup handler', () => {
    (global as any).setTimeout = jest.fn();
    (global as any).clearTimeout = jest.fn();
    const release = keepWorkerAlive({ throwOnParentPortError: false });

    expect(global.setTimeout).toHaveBeenCalledTimes(1);
    expect(global.clearTimeout).not.toHaveBeenCalled();

    release();

    expect(global.clearTimeout).toHaveBeenCalledTimes(1);
  });
});

describe('runWorker', () => {
  beforeEach(async () => {
    jest.clearAllMocks();

    mockWorkerData.mockReturnValue(null);

    const opts = await import('../options.context');

    jest.mocked(opts.runWithOptions).mockImplementation((_options, callback: any) => callback());
    jest.mocked(opts.runWithSession).mockImplementation((_options, callback: any) => callback());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should post success for route A, dynamic import resolves default export', async () => {
    jest.spyOn(global as any, 'Function').mockReturnValue(() =>
      Promise.resolve({ default: () => 'OK' }));

    mockWorkerData.mockReturnValue({ moduleSpecifier: '/any/path.mjs' } as any);

    await runWorker({ throwOnParentPortError: false });

    expect(mockParentPort.postMessage).toHaveBeenCalledWith({ success: true, payload: 'OK' });
  });

  it('should post failure for route A, export throws', async () => {
    jest.spyOn(global as any, 'Function').mockReturnValue(() =>
      Promise.resolve({ default: () => { throw new Error('dolor sit'); } }));

    mockWorkerData.mockReturnValue({ moduleSpecifier: '/any/path.mjs' } as any);

    await runWorker({ throwOnParentPortError: false });

    expect(mockParentPort.postMessage).toHaveBeenCalledWith({
      success: false,
      error: expect.objectContaining({ message: 'dolor sit' })
    });
  });

  it('should post success for route B, incoming task', async () => {
    jest.spyOn(global as any, 'Function').mockReturnValue(() =>
      Promise.resolve({ default: (args: any) => args?.value ?? 123 }));

    let handler: any;

    mockParentPort.on.mockImplementation((_evt, handle) => {
      handler = handle;
    });

    runWorker();

    expect(mockParentPort.on).toHaveBeenCalledWith('message', expect.any(Function));

    await handler({ moduleSpecifier: '/task.mjs', args: { value: 'OK' } });

    expect(mockParentPort.postMessage).toHaveBeenCalledWith({ success: true, payload: 'OK' });
  });

  it('should post failure for route B, export throws', async () => {
    jest.spyOn(global as any, 'Function').mockReturnValue(() =>
      Promise.resolve({ default: () => { throw new Error('lorem ipsum'); } }));

    let handler: any;

    mockParentPort.on.mockImplementation((_evt, handle) => {
      handler = handle;
    });

    runWorker();
    expect(mockParentPort.on).toHaveBeenCalledWith('message', expect.any(Function));

    await handler({ moduleSpecifier: '/task.mjs' });

    expect(mockParentPort.postMessage).toHaveBeenCalledWith({
      success: false,
      error: expect.objectContaining({ message: 'lorem ipsum' })
    });
  });
});
