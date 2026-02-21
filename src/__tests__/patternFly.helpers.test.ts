import {
  findClosestPatternFlyVersion,
  getPatternFlyVersionContext,
  normalizeEnumeratedPatternFlyVersion,
  filterEnumeratedPatternFlyVersions,
  disabled_findClosestPatternFlyVersion
} from '../patternFly.helpers';
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
  it('should provide a temporary closest version that always returns the latest version', async () => {
    await expect(findClosestPatternFlyVersion()).resolves.toBe('6.0.0');
  });

  it('should have a memoized property', () => {
    expect(findClosestPatternFlyVersion).toHaveProperty('memo');
  });
});

describe('getPatternFlyVersionContext', () => {
  it('should temporarily return option.defaults and latest versions with specific properties', async () => {
    const result = await getPatternFlyVersionContext();

    expect(Object.keys(result)).toMatchSnapshot('keys');
    expect(result.envSemVer).toBe('6.0.0');
    expect(result.envVersion).toBe('v6');
  });

  it('should have a memoized property', () => {
    expect(getPatternFlyVersionContext).toHaveProperty('memo');
  });
});

describe('normalizeEnumeratedPatternFlyVersion', () => {
  it.each([
    {
      description: 'exact semver',
      version: '6.0.0',
      expected: 'v6'
    },
    {
      description: 'semver',
      version: '6.4.10',
      expected: 'v6'
    },
    {
      description: 'tag',
      version: 'v6',
      expected: 'v6'
    },
    {
      description: 'current',
      version: 'current',
      expected: 'v6'
    },
    {
      description: 'latest',
      version: 'latest',
      expected: 'v6'
    },
    {
      description: 'detected',
      version: 'detected',
      expected: 'v6'
    },
    {
      description: 'unknown',
      version: 'unknown',
      expected: undefined
    },
    {
      description: 'unavailable exact semver',
      version: '5.0.0',
      expected: undefined
    },
    {
      description: 'unavailable semver',
      version: '5.2.10',
      expected: undefined
    },
    {
      description: 'unavailable tag',
      version: 'v5',
      expected: undefined
    },
    {
      description: 'undefined',
      version: undefined,
      expected: undefined
    },
    {
      description: 'null',
      version: null,
      expected: undefined
    },
    {
      description: 'empty',
      version: '',
      expected: undefined
    }
  ])('should attempt to normalize a PatternFly version to a valid tag display version, $description', async ({ version, expected }) => {
    const result = await normalizeEnumeratedPatternFlyVersion(version as any);

    expect(result).toBe(expected);
  });
});

describe('filterEnumeratedPatternFlyVersions', () => {
  it.each([
    {
      description: 'exact semver',
      version: '6.0.0'
    },
    {
      description: 'semver',
      version: '6.4.10'
    },
    {
      description: 'tag',
      version: 'v6'
    },
    {
      description: 'current',
      version: 'current'
    },
    {
      description: 'latest',
      version: 'latest'
    },
    {
      description: 'detected',
      version: 'detected'
    },
    {
      description: 'unavailable exact semver',
      version: '5.0.0'
    },
    {
      description: 'unavailable semver',
      version: '5.2.10'
    },
    {
      description: 'unavailable tag',
      version: 'v5'
    },
    {
      description: 'undefined',
      version: undefined
    },
    {
      description: 'null',
      version: null
    },
    {
      description: 'empty',
      version: ''
    }
  ])('should attempt to refine a PatternFly versions based on available enumerations, $description', async ({ version }) => {
    const result = await filterEnumeratedPatternFlyVersions(version as any);

    expect(result).toMatchSnapshot();
  });
});

describe('disabled_findClosestPatternFlyVersion', () => {
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
    const version = await disabled_findClosestPatternFlyVersion(path as any);

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
    const version = await disabled_findClosestPatternFlyVersion(process.cwd(), {
      ...DEFAULT_OPTIONS,
      patternflyOptions: {
        ...DEFAULT_OPTIONS.patternflyOptions,
        availableResourceVersions: ['4.0.0', '5.0.0', '6.0.0'] as any
      }
    });

    expect(version).toBe(expected);
  });
});
