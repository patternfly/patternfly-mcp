import { parseCliOptions } from '../options';

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
    },
    {
      description: 'with --http flag',
      args: ['node', 'script.js', '--http']
    },
    {
      description: 'with --http and --port',
      args: ['node', 'script.js', '--http', '--port', '8080']
    },
    {
      description: 'with --http and --host',
      args: ['node', 'script.js', '--http', '--host', '0.0.0.0']
    },
    {
      description: 'with --allowed-origins',
      args: ['node', 'script.js', '--http', '--allowed-origins', 'https://app.com,https://admin.app.com']
    },
    {
      description: 'with --allowed-hosts',
      args: ['node', 'script.js', '--http', '--allowed-hosts', 'localhost,127.0.0.1']
    },
    {
      description: 'with --cache-limit',
      args: ['node', 'script.js', '--http', '--cache-limit', '5']
    },
    {
      description: 'with --cache-limit 1',
      args: ['node', 'script.js', '--http', '--cache-limit', '1']
    }
  ])('should attempt to parse args $description', ({ args = [] }) => {
    process.argv = args;

    const result = parseCliOptions();

    expect(result).toMatchSnapshot();
  });

  it.each([
    {
      description: 'invalid',
      args: ['node', 'script.js', '--http', '--port', '99999']
    },
    {
      description: 'negative number',
      args: ['node', 'script.js', '--http', '--port', '-1']
    }
  ])('should throw port errors, $description', ({ args = [] }) => {
    process.argv = args;

    expect(() => parseCliOptions()).toThrowErrorMatchingSnapshot();
  });
});
