import { memo } from '../server.caching';

describe('memo', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([
    {
      description: 'sync',
      options: { cacheLimit: 2 },
      params: [[], [], [1], [1], [2], [2], [3], [3], [1]]
    },
    {
      description: 'sync errors',
      options: { cacheLimit: 2, cacheErrors: true },
      params: [[, true], [, true], [4, true], [4, true], [5, true], [5, true], [6, true], [6, true], [4, true]]
    },
    {
      description: 'sync errors NOT cached',
      options: { cacheLimit: 2, cacheErrors: false },
      params: [[7, true], [7, true], [8], [8], [9, true], [9, true], [7, true]]
    },
    {
      description: 'bypass memoization when cacheLimit is zero',
      options: { cacheLimit: 0 },
      params: [[], [], [1], [1], [2, true], [2, true]]
    }
  ])('should memoize a function, $description', ({ options, params }) => {
    const log: { type: string; value: () => string; cache: string[] }[] = [];
    const debug = (response: any) => log.push(response);

    const memoized = memo(
      (str, isError = false) => {
        const arr = ['lorem', 'ipsum', 'dolor', 'sit'];
        const randomStr = Math.floor(Math.random() * arr.length);
        const genStr = `${arr[randomStr]}-${str || '[EMPTY]'}`;

        if (isError) {
          throw new Error(genStr);
        }

        return genStr;
      },
      { debug, ...options }
    );

    for (const param of params) {
      try {
        memoized(...param as [unknown, unknown]);
      } catch {}
    }

    const updatedLog = [];

    for (const { type, value, cache } of log) {
      let successValue;
      let errorValue;

      try {
        successValue = value();
      } catch (e) {
        const error = e as Error;

        errorValue = error.message;
      }

      successValue = successValue?.split?.('-')[1];
      errorValue = errorValue?.split?.('-')[1];

      updatedLog.push({ type, successValue, errorValue, cacheLength: cache.length });
    }

    expect(updatedLog).toMatchSnapshot();
  });

  it.each([
    {
      description: 'async',
      options: { cacheLimit: 2 },
      params: [[], [], [1], [1], [2], [2], [3], [3], [1]]
    },
    {
      description: 'async errors',
      options: { cacheLimit: 2, cacheErrors: true },
      params: [[, true], [, true], [4, true], [4, true], [5, true], [5, true], [6, true], [6, true], [4, true]]
    },
    {
      description: 'async errors NOT cached',
      options: { cacheLimit: 2, cacheErrors: false },
      params: [[7, true], [7, true], [8], [8], [9, true], [9, true], [7, true]]
    },
    {
      description: 'async bypass memoization when cacheLimit is zero',
      options: { cacheLimit: 0 },
      params: [[], [], [1], [1], [2, true], [2, true]]
    }
  ])('should memoize a function, $description', async ({ options, params }) => {
    const log: { type: string; value: () => Promise<string>; cache: string[] }[] = [];
    const debug = (response: any) => log.push(response);
    const memoized = memo(
      async (str, isError = false) => {
        const arr = ['lorem', 'ipsum', 'dolor', 'sit'];
        const randomStr = Math.floor(Math.random() * arr.length);
        const genStr = `${arr[randomStr]}-${str || '[EMPTY]'}`;

        if (isError) {
          throw new Error(genStr);
        }

        return genStr;
      },
      { debug, ...options }
    );

    try {
      await Promise.all(params.map(param => memoized(...param as [unknown, unknown])));
    } catch {}

    const updatedLog = [];

    for (const { type, value, cache } of log) {
      let successValue;
      let errorValue;

      try {
        successValue = await value();
      } catch (e) {
        const error = e as Error;

        errorValue = error.message;
      }

      successValue = successValue?.split?.('-')[1];
      errorValue = errorValue?.split?.('-')[1];

      updatedLog.push({ type, successValue, errorValue, cacheLength: cache.length });
    }

    expect(updatedLog).toMatchSnapshot();
  });

  it.each([
    {
      description: 'async',
      options: { cacheLimit: 3, expire: 10 },
      paramsOne: [[], [], [1], [1], [2], [2]],
      paramsTwo: [[3, true], [3, true], [4, true], [4, true], [5, true], [5, true]],
      pause: 70
    }
  ])('should clear cache on inactivity, $description', async ({ options, paramsOne, paramsTwo, pause }) => {
    const log: { type: string; value: () => Promise<string>; cache: string[] }[] = [];
    const debug = (response: any) => log.push(response);
    const memoized = memo(async (str, isError = false) => {
      const arr = ['lorem', 'ipsum', 'dolor', 'sit'];
      const randomStr = Math.floor(Math.random() * arr.length);
      const genStr = `${arr[randomStr]}-${str || '[EMPTY]'}`;

      if (isError) {
        throw new Error(genStr);
      }

      return genStr;
    }, { debug, ...options });

    try {
      await Promise.all(paramsOne.map(param => memoized(...param as [unknown])));
    } catch {}

    jest.advanceTimersByTime(pause);

    try {
      await Promise.all(paramsTwo.map(param => memoized(...param as [unknown, unknown])));
    } catch {}

    jest.advanceTimersByTime(pause);

    const updatedLog = [];

    for (const { cache } of log) {
      updatedLog.push(cache.filter(Boolean).length);
    }

    expect(updatedLog).toMatchSnapshot('cache list length');
  });
});
