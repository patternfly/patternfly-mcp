import { ReadableStream } from 'node:stream/web';
import { setFetch, FetchError } from '../server.fetch';
import { getOptions } from '../options.context';

describe('setFetch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('should fetch and parse text', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {
        get: (name: string) => {
          if (name === 'content-length') {
            return '11';
          }

          if (name === 'content-type') {
            return 'text/plain';
          }

          return null;
        }
      },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('hello '));
          controller.enqueue(new TextEncoder().encode('world'));
          controller.close();
        }
      })
    };

    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    const { get, status } = setFetch();
    const result = await get('https://patternfly.org');

    expect(result).toEqual(expect.objectContaining({
      type: 'text',
      status: 200,
      data: 'hello world'
    }));

    expect(status()).toEqual(expect.objectContaining({
      type: 'text',
      phase: 'success',
      progress: 100,
      data: 'hello world'
    }));
  });

  it('should fetch and parse JSON', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {
        get: (name: string) => {
          if (name === 'content-type') {
            return 'application/json';
          }

          return null;
        }
      },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"foo": "bar"}'));
          controller.close();
        }
      })
    };

    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    const { get } = setFetch();
    const result = await get('https://patternfly.org/data.json');

    expect(result.type).toBe('json');
    expect(result.data).toEqual({ foo: 'bar' });
  });

  it('should reject with FetchError on non-ok response', async () => {
    const mockResponse = {
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: {
        get: () => null
      }
    };

    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    const { get, status } = setFetch();
    const { phase: prePhase } = status() as any;

    expect(prePhase).toBe('idle');

    await expect(get('https://patternfly.org/404')).rejects.toThrow(FetchError);

    const { phase: postPhase } = status() as any;

    expect(postPhase).toBe('error');
  });

  it('should check content-length against maxSizeBytes', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {
        get: (name: string) => (name === 'content-length' ? '1000' : null)
      }
    };

    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    const options = {
      ...getOptions(),
      xhrFetch: { allowBinary: false, maxSizeBytes: 500, timeoutMs: 1000, preflightHead: false }
    };

    const { get, status } = setFetch(options as any);

    await expect(get('https://patternfly.org')).rejects.toThrow('File blocked: exceeds 500 bytes.');

    expect((status() as any).phase).toBe('error');
  });

  it('should handle cancel properly', async () => {
    let rejectPull: (reason: any) => void = () => {};
    const mockCancel = jest.fn();

    const stream = new ReadableStream({
      pull() {
        return new Promise((_, reject) => {
          rejectPull = reject;
        });
      },
      cancel(reason) {
        mockCancel(reason);
        rejectPull(reason);
      }
    });

    const mockResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {
        get: () => null
      },
      body: stream
    };

    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    const { get, cancel, status } = setFetch();
    const promise = get('https://patternfly.org');

    // Wait for the fetch to start and hit the reader
    await new Promise(resolve => setTimeout(resolve, 10));

    expect((status() as any).phase).toBe('loading');

    cancel();

    await expect(promise).rejects.toMatchObject({ cancelled: true });
    expect((status() as any).phase).toBe('cancelled');
    expect(mockCancel).toHaveBeenCalled();
  });

  it('should handle timeout', async () => {
    jest.useFakeTimers();

    (global.fetch as jest.Mock).mockImplementation((_url, init) => new Promise((_, reject) => {
      if (init?.signal) {
        init.signal.addEventListener('abort', () => {
          reject(init.signal.reason);
        });
      }
    }));

    const options = {
      ...getOptions(),
      xhrFetch: { allowBinary: false, maxSizeBytes: 0, timeoutMs: 100, preflightHead: false }
    };

    const { get, status } = setFetch(options as any);
    const promise = get('https://patternfly.org');

    jest.advanceTimersByTime(150);

    await expect(promise).rejects.toThrow(/Timeout/);
    expect((status() as any).phase).toBe('error');

    jest.useRealTimers();
  });
});
