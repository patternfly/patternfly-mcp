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
    }
  ])('should attempt to parse args $description', ({ args = [] }) => {
    process.argv = args;

    const result = parseCliOptions();

    expect(result).toMatchSnapshot();
  });
});
