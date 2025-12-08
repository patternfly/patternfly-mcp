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
      description: 'with --verbose flag',
      args: ['node', 'script.js', '--verbose']
    },
    {
      description: 'with --verbose flag and --log-level flag',
      args: ['node', 'script.js', '--verbose', '--log-level', 'warn']
    },
    {
      description: 'with --log-level flag',
      args: ['node', 'script.js', '--log-level', 'warn']
    },
    {
      description: 'with --log-stderr flag and --log-protocol flag',
      args: ['node', 'script.js', '--log-stderr', '--log-protocol']
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
      args: ['node', 'script.js', '--http', '--port', '6000']
    },
    {
      description: 'with --http and invalid --port',
      args: ['node', 'script.js', '--http', '--port', '0']
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
    }
  ])('should attempt to parse args $description', ({ args = [] }) => {
    process.argv = args;

    const result = parseCliOptions();

    expect(result).toMatchSnapshot();
  });

  it('parses from a provided argv independent of process.argv', () => {
    const customArgv = ['node', 'cli', '--http', '--port', '3101'];
    const result = parseCliOptions(customArgv);

    expect(result.http?.port).toBe(3101);
  });

  it('trims spaces in list flags', () => {
    const argv = ['node', 'cli', '--http', '--allowed-hosts', ' localhost , 127.0.0.1  '];
    const result = parseCliOptions(argv);

    expect(result.http?.allowedHosts).toEqual(['localhost', '127.0.0.1']);
  });
});
