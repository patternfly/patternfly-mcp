import { type ExperimentalOptionKey } from '../options';
import { parseCliOptions, parseProgrammaticOptions, pickProgrammaticOptions } from '../options.parser';

describe('parseCliOptions', () => {
  it.each([
    {
      description: 'with --verbose flag',
      args: ['node', 'script.js', '--verbose'],
      expectedOptions: expect.objectContaining({
        logging: expect.objectContaining({ level: 'debug' })
      })
    },
    {
      description: 'with --verbose flag and --log-level flag',
      args: ['node', 'script.js', '--verbose', '--log-level', 'warn'],
      expectedOptions: expect.objectContaining({
        logging: expect.objectContaining({ level: 'debug' })
      })
    },
    {
      description: 'with --log-level flag',
      args: ['node', 'script.js', '--log-level', 'warn'],
      expectedOptions: expect.objectContaining({
        logging: expect.objectContaining({ level: 'warn' })
      })
    },
    {
      description: 'with --log-stderr flag and --log-protocol flag',
      args: ['node', 'script.js', '--log-stderr', '--log-protocol'],
      expectedOptions: expect.objectContaining({
        logging: expect.objectContaining({
          stderr: true,
          protocol: true
        })
      })
    },
    {
      description: 'with other arguments',
      args: ['node', 'script.js', 'other', 'args'],
      expectedOptions: expect.objectContaining({
        logging: expect.objectContaining({ level: 'info' })
      })
    },
    {
      description: 'with --http flag',
      args: ['node', 'script.js', '--http'],
      expectedOptions: expect.objectContaining({
        isHttp: true
      })
    },
    {
      description: 'with --http and --port',
      args: ['node', 'script.js', '--http', '--port', '6000'],
      expectedOptions: expect.objectContaining({
        isHttp: true,
        http: expect.objectContaining({ port: 6000 })
      })
    },
    {
      description: 'with --http and invalid --port',
      args: ['node', 'script.js', '--http', '--port', '0'],
      expectedOptions: expect.objectContaining({
        isHttp: true,
        http: expect.objectContaining({ port: 0 })
      })
    },
    {
      description: 'with --http and --host',
      args: ['node', 'script.js', '--http', '--host', '0.0.0.0'],
      expectedOptions: expect.objectContaining({
        isHttp: true,
        http: expect.objectContaining({ host: '0.0.0.0' })
      })
    },
    {
      description: 'with --allowed-origins',
      args: ['node', 'script.js', '--http', '--allowed-origins', 'https://app.com,https://admin.app.com'],
      expectedOptions: expect.objectContaining({
        isHttp: true,
        http: expect.objectContaining({
          allowedOrigins: ['https://app.com', 'https://admin.app.com']
        })
      })
    },
    {
      description: 'with --allowed-hosts',
      args: ['node', 'script.js', '--http', '--allowed-hosts', 'localhost,127.0.0.1'],
      expectedOptions: expect.objectContaining({
        isHttp: true,
        http: expect.objectContaining({
          allowedHosts: ['localhost', '127.0.0.1']
        })
      })
    },
    {
      description: 'with --allowed-hosts with spaces',
      args: ['node', 'script.js', '--http', '--allowed-hosts', '   localhost, 127.0.0.1   '],
      expectedOptions: expect.objectContaining({
        isHttp: true,
        http: expect.objectContaining({
          allowedHosts: ['localhost', '127.0.0.1']
        })
      })
    },
    {
      description: 'with --tool',
      args: ['node', 'script.js', '--tool', 'my-tool', '--tool', 'my-other-tool'],
      expectedOptions: expect.objectContaining({
        toolModules: ['my-tool', 'my-other-tool']
      })
    },
    {
      description: 'with --plugin-isolation strict',
      args: ['node', 'script.js', '--plugin-isolation', 'STRICT'],
      expectedOptions: expect.objectContaining({
        pluginIsolation: 'strict'
      })
    },
    {
      description: 'with --plugin-isolation none',
      args: ['node', 'script.js', '--plugin-isolation', 'none'],
      expectedOptions: expect.objectContaining({
        pluginIsolation: 'none'
      })
    },
    {
      description: 'with --plugin-isolation undefined',
      args: ['node', 'script.js', '--plugin-isolation', '--verbose'],
      expectedOptions: expect.objectContaining({
        pluginIsolation: undefined
      })
    },
    {
      description: 'with comma-separated tools',
      args: ['node', 'script.js', '--tool', 'tool-a,tool-b', '--http'],
      expectedOptions: expect.objectContaining({
        isHttp: true,
        toolModules: ['tool-a', 'tool-b']
      })
    },
    {
      description: 'with arg-separated tools',
      args: ['node', 'script.js', '--tool', 'tool-a', 'tool-b', '--http'],
      expectedOptions: expect.objectContaining({
        isHttp: true,
        toolModules: ['tool-a', 'tool-b']
      })
    },
    {
      description: 'with separated tools',
      args: ['node', 'script.js', '--tool', 'tool-a', '--tool', 'tool-b', '--http'],
      expectedOptions: expect.objectContaining({
        isHttp: true,
        toolModules: ['tool-a', 'tool-b']
      })
    },
    {
      description: 'dedupes repeated tools',
      args: ['node', 'script.js', '--tool', 'tool-a', '--tool', 'tool-a'],
      expectedOptions: expect.objectContaining({
        toolModules: ['tool-a']
      })
    },
    {
      description: 'with --mode test',
      args: ['node', 'script.js', '--mode', 'test'],
      expectedOptions: expect.objectContaining({
        mode: 'test'
      })
    },
    {
      description: 'with --mode-test-url',
      args: ['node', 'script.js', '--mode', 'test', '--mode-test-url', 'https://example.com'],
      expectedOptions: expect.objectContaining({
        mode: 'test',
        modeOptions: expect.objectContaining({
          test: expect.objectContaining({ baseUrl: 'https://example.com' })
        })
      })
    },
    {
      description: 'ignores invalid --log-level and keeps previous valid value',
      args: ['node', 'script.js', '--log-level', 'warn', '--log-level', 'invalid'],
      expectedOptions: expect.objectContaining({
        logging: expect.objectContaining({ level: 'warn' })
      })
    },
    {
      description: 'last one wins for --mode',
      args: ['node', 'script.js', '--mode', 'test', '--mode', 'cli'],
      expectedOptions: expect.objectContaining({
        mode: 'cli'
      })
    }
  ])('should attempt to parse args $description', ({ args, expectedOptions }) => {
    const result = parseCliOptions(args);

    expect(result.options).toMatchObject(expectedOptions);
  });

  it.each([
    {
      description: 'tolerates an explicitly undefined option',
      args: ['node', 'cli', '--verbose'],
      experimentalOptions: undefined,
      expectedOptions: expect.objectContaining({ logging: expect.objectContaining({ level: 'debug' }) }),
      expectedExperimental: []
    },
    {
      description: 'ignores direct CLI flags registered as experimental',
      args: ['node', 'cli', '--plugin-isolation', 'strict'],
      experimentalOptions: new Set<any>(['pluginIsolation']),
      expectedOptions: expect.objectContaining({ pluginIsolation: undefined }),
      expectedExperimental: []
    },
    {
      description: 'applies registered experimental options via --experimental- prefix',
      args: ['node', 'cli', '--experimental-plugin-isolation', 'none'],
      experimentalOptions: new Set<any>(['pluginIsolation']),
      expectedOptions: expect.objectContaining({ pluginIsolation: 'none' }),
      expectedExperimental: ['pluginIsolation']
    },
    {
      description: 'dedupes repeated experimental CLI flags',
      args: ['node', 'cli', '--experimental-plugin-isolation', 'none', '--experimental-plugin-isolation', 'strict'],
      experimentalOptions: new Set<any>(['pluginIsolation']),
      expectedOptions: expect.objectContaining({ pluginIsolation: 'strict' }),
      expectedExperimental: ['pluginIsolation']
    },
    {
      description: 'uses a custom experimental prefix',
      args: ['node', 'cli', '--beta-plugin-isolation', 'none'],
      experimentalOptions: new Set<any>(['pluginIsolation']),
      settings: { experimentalPrefix: 'beta' },
      expectedOptions: expect.objectContaining({ pluginIsolation: 'none' }),
      expectedExperimental: ['pluginIsolation']
    },
    {
      description: 'handles multiple experimental CLI flags with strict registry typing',
      args: ['node', 'cli', '--experimental-plugin-isolation', 'none', '--experimental-custom-option', 'value'],
      experimentalOptions: new Set<ExperimentalOptionKey>(['pluginIsolation', 'customOption' as ExperimentalOptionKey]),
      expectedOptions: expect.objectContaining({ pluginIsolation: 'none' }),
      expectedExperimental: ['pluginIsolation', 'customOption']
    },
    {
      description: 'drop orphan value after direct flag registered as experimental',
      args: ['node', 'cli', '--log-level', 'warn', '--plugin-isolation', 'strict'],
      experimentalOptions: new Set<any>(['pluginIsolation']),
      expectedOptions: expect.objectContaining({
        pluginIsolation: undefined,
        logging: expect.objectContaining({ level: 'warn' })
      }),
      expectedExperimental: []
    },
    {
      description: 'drop orphan value after unregistered experimental flag',
      args: ['node', 'cli', '--log-level', 'warn', '--experimental-lorem-ipsum', 'strict', '--verbose'],
      experimentalOptions: new Set<any>(['pluginIsolation']),
      expectedOptions: expect.objectContaining({
        pluginIsolation: undefined,
        logging: expect.objectContaining({ level: 'debug' })
      }),
      expectedExperimental: []
    }
  ])('should handle experimental options, $description', ({ args, experimentalOptions, settings, expectedOptions, expectedExperimental }) => {
    const result = parseCliOptions(args, { ...settings, experimentalOptions } as any);

    expect(result.options).toMatchObject(expectedOptions);
    expect(result.experimentalOptions).toEqual(expectedExperimental);
  });

  it('does not apply HTTP flags when --http is absent', () => {
    const { options } = parseCliOptions(['node', 'cli', '--port', '9000', '--host', '0.0.0.0']);

    expect(options.isHttp).toBe(false);
    expect(options.http).toBeUndefined();
  });
});

describe('parseProgrammaticOptions', () => {
  it.each([
    {
      description: 'maps experimental-prefixed keys when registered',
      input: { experimentalPluginIsolation: 'none', pluginIsolation: 'strict' },
      experimentalOptions: new Set<any>(['pluginIsolation']),
      expectedOptions: expect.objectContaining({ pluginIsolation: 'none' }),
      expectedExperimental: ['pluginIsolation']
    },
    {
      description: 'ignores direct keys registered as experimental',
      input: { pluginIsolation: 'strict' },
      experimentalOptions: new Set<any>(['pluginIsolation']),
      expectedOptions: expect.objectContaining({}),
      expectedExperimental: []
    },
    {
      description: 'removes experimental-prefixed keys that are not registered',
      input: { experimentalPluginIsolation: 'none' },
      experimentalOptions: new Set(),
      expectedOptions: expect.not.objectContaining({ pluginIsolation: 'none' }),
      expectedExperimental: []
    },
    {
      description: 'ignore experimental metadata array',
      input: { experimental: ['pluginIsolation'] },
      experimentalOptions: new Set(),
      expectedOptions: expect.objectContaining({}),
      expectedExperimental: []
    },
    {
      description: 'tolerates an explicitly undefined experimental registry',
      input: { logging: { level: 'warn' } },
      experimentalOptions: undefined,
      expectedOptions: expect.objectContaining({ logging: { level: 'warn' } }),
      expectedExperimental: []
    },
    {
      description: 'uses a custom experimental prefix',
      input: { betaPluginIsolation: 'none' },
      experimentalOptions: new Set<any>(['pluginIsolation']),
      settings: { experimentalPrefix: 'beta' },
      expectedOptions: expect.objectContaining({ pluginIsolation: 'none' }),
      expectedExperimental: ['pluginIsolation']
    },
    {
      description: 'handles multiple different experimental options and enforces typing',
      input: { experimentalPluginIsolation: 'none', experimentalCustomOption: 'value' },
      experimentalOptions: new Set<ExperimentalOptionKey>(['pluginIsolation', 'customOption' as ExperimentalOptionKey]),
      expectedOptions: expect.objectContaining({ pluginIsolation: 'none' }),
      expectedExperimental: ['pluginIsolation', 'customOption']
    },
    {
      description: 'last duplicate experimental prefixed key wins from JSON',
      input: JSON.parse('{ "experimentalPluginIsolation": "strict", "experimentalPluginIsolation": "none" }'),
      experimentalOptions: new Set<any>(['pluginIsolation']),
      expectedOptions: expect.objectContaining({ pluginIsolation: 'none' }),
      expectedExperimental: ['pluginIsolation']
    },
    {
      description: 'ignores experimental prefixed keys inherited from a parent object',
      input: Object.create({ experimentalPluginIsolation: 'strict' }),
      experimentalOptions: new Set<any>(['pluginIsolation']),
      expectedOptions: expect.not.objectContaining({ pluginIsolation: 'strict' }),
      expectedExperimental: []
    }
  ])('should handle experimental options, $description', ({ input, experimentalOptions, settings, expectedOptions, expectedExperimental }) => {
    const result = parseProgrammaticOptions(input as any, { ...settings, experimentalOptions } as any);

    expect(result.options).toEqual(expectedOptions);
    expect(result.experimentalOptions).toEqual(expectedExperimental);
  });

  it('should ensure Object.prototype is not polluted via constructor', () => {
    const input = JSON.parse('{ "constructor": { "prototype": { "polluted": true } } }');

    parseProgrammaticOptions(input);

    expect(({} as any).polluted).toBeUndefined();

    delete (Object.prototype as any).polluted;
  });

  it('should ensure the returned options object does not inherit properties from __proto__ input', () => {
    const input = JSON.parse('{ "__proto__": { "polluted": true } }');

    const { options } = parseProgrammaticOptions(input);

    // Verifies that the "polluted" property did not leak onto the result
    expect((options as any).polluted).toBeUndefined();

    delete (Object.prototype as any).polluted;
  });

  it('should verify that experimental mapping still obeys Object.hasOwn', () => {
    const experimentalKey = 'experimentalPluginIsolation';

    (Object.prototype as any)[experimentalKey] = 'strict';

    try {
      const { options, experimentalOptions } = parseProgrammaticOptions(
        {},
        { experimentalOptions: new Set(['pluginIsolation']) } as any
      );

      expect(options.pluginIsolation).toBeUndefined();
      expect(experimentalOptions).not.toContain('pluginIsolation');
    } finally {
      delete (Object.prototype as any)[experimentalKey];
    }
  });
});

describe('pickProgrammaticOptions', () => {
  it.each([
    {
      description: 'filter out non-programmatic options',
      source: { name: 'test-server', invalidKey: 'should-be-removed' },
      expected: { name: 'test-server' }
    },
    {
      description: 'include all valid programmatic options',
      source: { name: 'test-server', pluginIsolation: 'none', logging: { level: 'debug' } },
      expected: { name: 'test-server', pluginIsolation: 'none', logging: { level: 'debug' } }
    },
    {
      description: 'return an empty object when no valid keys are present',
      source: { unknown: 'value', anotherUnknown: 123 },
      expected: {}
    },
    {
      description: 'handle custom baseOptions',
      source: { name: 'test-server', custom: 'value' },
      settings: { baseOptions: ['custom'] },
      expected: { custom: 'value' }
    },
    {
      description: 'handle empty source object',
      source: {},
      expected: {}
    }
  ])('should $description', ({ source, settings, expected }) => {
    const result = pickProgrammaticOptions(source as any, settings as any);

    expect(result).toEqual(expected);
  });
});
