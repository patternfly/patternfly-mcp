import { findClosestPatternFlyVersion } from '../patternFly.helpers';
import { readLocalFileFunction } from '../server.getResources';
import { DEFAULT_OPTIONS } from '../options.defaults';

jest.mock('../server.getResources', () => ({
  ...jest.requireActual('../server.getResources'),
  readLocalFileFunction: {
    memo: jest.fn()
  }
}));

const mockReadLocalFile = readLocalFileFunction.memo as jest.Mock;

describe('findClosestPatternFlyVersion', () => {
  it.each([
    {
      description: 'non-existent path',
      path: '/mock/package.json',
      expected: '6.0.0'
    },
    {
      description: 'non-string path',
      path: 1,
      expected: '6.0.0'
    }
  ])('should return default version if no package.json is found, $description', async ({ path, expected }) => {
    const version = await findClosestPatternFlyVersion(path as any);

    expect(version).toBe(expected);
  });

  it.each([
    {
      description: 'basic',
      deps: {
        '@patternfly/react-core': '^5.0.0'
      },
      expected: '5.0.0'
    },
    {
      description: 'greater than or equal, major, minor, patch',
      deps: {
        '@patternfly/react-core': '<=4.5.5'
      },
      expected: '4.0.0'
    },
    {
      description: 'range, greater than less than equal',
      deps: {
        '@patternfly/react-core': '>=4.0.0 <=5.0.0'
      },
      expected: '5.0.0'
    },
    {
      description: 'range, inclusive',
      deps: {
        '@patternfly/react-core': '4.0.0 - 5.0.0'
      },
      expected: '5.0.0'
    },
    {
      description: 'git path',
      deps: {
        '@patternfly/react-core': 'https://github.com/patternfly/patternfly-mcp.git#v5'
      },
      expected: '6.0.0'
    },
    {
      description: 'unknown local path',
      deps: {
        '@patternfly/react-core': './patternfly-mcp#v5'
      },
      expected: '6.0.0'
    },
    {
      description: 'mismatched versions',
      deps: {
        '@patternfly/patternfly': '^4.0.0',
        '@patternfly/react-core': '^6.0.0'
      },
      expected: '6.0.0'
    },
    {
      description: 'fuzzy match -next',
      deps: {
        '@patternfly/react-core-next': '^5.0.0'
      },
      expected: '5.0.0'
    },
    {
      description: 'fuzzy match -rc',
      deps: {
        '@patternfly/react-core-rc': '^5.0.0'
      },
      expected: '5.0.0'
    },
    {
      description: 'fuzzy match -alpha',
      deps: {
        '@patternfly/patternfly-alpha': '^5.0.0'
      },
      expected: '5.0.0'
    },
    {
      description: 'fuzzy match -beta',
      deps: {
        '@patternfly/patternfly-beta': '^5.0.0'
      },
      expected: '5.0.0'
    },
    {
      description: 'attempted fuzzy match scope',
      deps: {
        '@scope/patternfly-alt': '^5.0.0'
      },
      expected: '6.0.0'
    },
    {
      description: 'attempted false positive fuzzy match',
      deps: {
        'patternfly/patternfly': '^5.0.0'
      },
      expected: '6.0.0'
    },
    {
      description: 'wildcard match',
      deps: {
        '@patternfly/patternfly': '^5.x.x'
      },
      expected: '5.0.0'
    },
    {
      description: 'mismatched versions with expanded available versions',
      deps: {
        '@patternfly/patternfly': '^4.0.0',
        '@patternfly/react-core': '^5.0.0'
      },
      expected: '5.0.0'
    }
  ])('should attempt to match whitelisted packages, $description', async ({ deps, expected }) => {
    mockReadLocalFile.mockResolvedValue(JSON.stringify({
      dependencies: { ...deps }
    }));

    // Use the PF MCP package.json so we can override with "mockReadLocalFile". Override available resource versions.
    const version = await findClosestPatternFlyVersion(process.cwd(), {
      ...DEFAULT_OPTIONS,
      patternflyOptions: {
        ...DEFAULT_OPTIONS.patternflyOptions,
        availableResourceVersions: ['4.0.0', '5.0.0', '6.0.0']
      }
    });

    expect(version).toBe(expected);
  });
});
