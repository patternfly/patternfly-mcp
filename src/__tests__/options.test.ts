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
    }
  ])('should attempt to parse args $description', ({ args = [] }) => {
    process.argv = args;

    const result = parseCliOptions();

    expect(result).toMatchSnapshot();
  });

  describe('HTTP transport options', () => {
    it.each([
      {
        description: 'with --http flag',
        args: ['node', 'script.js', '--http'],
        expected: { http: true, port: 3000, host: 'localhost' }
      },
      {
        description: 'with --http and --port',
        args: ['node', 'script.js', '--http', '--port', '8080'],
        expected: { http: true, port: 8080, host: 'localhost' }
      },
      {
        description: 'with --http and --host',
        args: ['node', 'script.js', '--http', '--host', '0.0.0.0'],
        expected: { http: true, port: 3000, host: '0.0.0.0' }
      },
      {
        description: 'with --allowed-origins',
        args: ['node', 'script.js', '--http', '--allowed-origins', 'https://app.com,https://admin.app.com'],
        expected: {
          http: true,
          port: 3000,
          host: 'localhost',
          allowedOrigins: ['https://app.com', 'https://admin.app.com']
        }
      },
      {
        description: 'with --allowed-hosts',
        args: ['node', 'script.js', '--http', '--allowed-hosts', 'localhost,127.0.0.1'],
        expected: {
          http: true,
          port: 3000,
          host: 'localhost',
          allowedHosts: ['localhost', '127.0.0.1']
        }
      }
    ])('should parse HTTP options $description', ({ args, expected }) => {
      process.argv = args;

      const result = parseCliOptions();

      expect(result).toMatchObject(expected);
    });

    it('should throw error for invalid port', () => {
      process.argv = ['node', 'script.js', '--http', '--port', '99999'];

      expect(() => parseCliOptions()).toThrow('Invalid port: 99999. Must be between 1 and 65535.');
    });

    it('should throw error for invalid port (negative)', () => {
      process.argv = ['node', 'script.js', '--http', '--port', '-1'];

      expect(() => parseCliOptions()).toThrow('Invalid port: -1. Must be between 1 and 65535.');
    });
  });
});
