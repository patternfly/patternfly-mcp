import * as options from '../options';
import { parseCliOptions, setOptions, OPTIONS } from '../options';

describe('options', () => {
  it('should return specific properties', () => {
    expect(options).toMatchSnapshot();
  });
});

describe('parseCliOptions', () => {
  const originalArgv = process.argv;

  afterEach(() => {
    process.argv = originalArgv;
  });

  it.each([
    {
      description: 'with --docs-host flag',
      args: ['node', 'script.js', '--docs-host']
    },
    {
      description: 'without --docs-host flag',
      args: ['node', 'script.js']
    },
    {
      description: 'with other arguments',
      args: ['node', 'script.js', 'other', 'args']
    }
  ])('should attempt to parse args $description', ({ args = [] }) => {
    process.argv = args;

    const result = parseCliOptions();

    expect(result).toMatchSnapshot();
  });
});

describe('setOptions', () => {
  it('should return options with consistent properties', () => {
    const result = setOptions({ docsHost: true });
    const { sessionId, ...remainingOptions } = result;

    expect(result).not.toBe(OPTIONS);
    expect(sessionId).toBeDefined();
    expect(sessionId?.length).toBe(40);
    expect(remainingOptions).toMatchSnapshot('options');
  });

  it.each([{
    description: 'with docsHost set to true',
    firstOptions: { docsHost: true },
    secondOptions: { docsHost: true }
  },
  {
    description: 'with docsHost set differently',
    firstOptions: { docsHost: true },
    secondOptions: { docsHost: false }
  },
  {
    description: 'with empty options',
    firstOptions: {},
    secondOptions: {}
  }])('should create independent option instances, $description', ({ firstOptions, secondOptions }) => {
    // First instance
    const firstInstance = setOptions(firstOptions);

    // Second instance
    const secondInstance = setOptions(secondOptions);

    expect(OPTIONS).toEqual(secondInstance);
    expect(firstInstance).not.toEqual(secondInstance);
    expect(firstInstance.sessionId).not.toBe(secondInstance.sessionId);
  });

  it('should allow modification of returned options instance but not the global OPTIONS', () => {
    const freshOptions = setOptions({ docsHost: true });

    // Should be able to modify the returned instance
    freshOptions.docsHost = false;
    expect(freshOptions.docsHost).toBe(false);

    // OPTIONS should remain unchanged
    expect(OPTIONS.docsHost).toBe(true);
  });
});
