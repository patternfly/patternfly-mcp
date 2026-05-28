import { filterPatternFly, searchPatternFly } from '../patternFly.search';

describe('filterPatternFly', () => {
  const mockResources = new Map([
    ['button', {
      name: 'button',
      groupId: 'button-group-id',
      entries: [
        { id: 'btn-v6-react', name: 'button', version: 'v6', section: 'components', category: 'action', groupId: 'button-group-id' },
        { id: 'btn-v5-react', name: 'button', version: 'v5', section: 'components', category: 'action', groupId: 'button-group-id' }
      ],
      versions: {
        v6: {
          isSchemasAvailable: true,
          uri: 'patternfly://docs/button?version=v6',
          uriSchemas: 'patternfly://schemas/button?version=v6',
          uriSchemasId: 'button-group-id'
        },
        v5: {
          isSchemasAvailable: false,
          uri: 'patternfly://docs/button?version=v5'
        }
      }
    }],
    ['modal', {
      name: 'modal',
      entries: [
        { name: 'modal', section: 'components', category: 'view', version: 'v6' }
      ]
    }]
  ]);

  it.each([
    {
      description: 'all entries, undefined',
      filters: undefined,
      expectedNames: ['button', 'button', 'modal']
    },
    {
      description: 'all entries, empty object',
      filters: {},
      expectedNames: ['button', 'button', 'modal']
    },
    {
      description: 'by version',
      filters: { version: 'v5' },
      expectedNames: ['button']
    },
    {
      description: 'name, button',
      filters: { name: 'button' },
      expectedNames: ['button', 'button']
    },
    {
      description: 'name, modal',
      filters: { name: 'modal' },
      expectedNames: ['modal']
    },
    {
      description: 'name, hash',
      filters: { name: 'btn-v6-react' },
      expectedNames: ['button']
    },
    {
      description: 'section, components',
      filters: { section: 'components' },
      expectedNames: ['button', 'button', 'modal']
    },
    {
      description: 'category, action',
      filters: { category: 'action' },
      expectedNames: ['button', 'button']
    }
  ])('should return filtered results, $description', async ({ filters, expectedNames }) => {
    const result = await filterPatternFly(filters as any, mockResources as any);

    expect(result.byEntry.map(result => result.name)).toEqual(expectedNames);
  });

  it('should filter number results', async () => {
    const result = await filterPatternFly(
      { section: 1 } as any,
      new Map([['loremIpsum', { entries: [{ section: 1 }, { section: 'dolor' }] }]]) as any
    );

    expect(result.byEntry).toEqual(expect.arrayContaining([{ section: 1 }]));
    expect(Array.from(result.byResource).length).toBeGreaterThanOrEqual(0);
  });
});

describe('searchPatternFly', () => {
  const mockMcpResources = {
    resources: new Map([
      ['button', {
        name: 'button',
        groupId: 'btn-group',
        entries: [
          { id: 'btn-v6-hash', name: 'button', version: 'v6', section: 'components', category: 'action', groupId: 'btn-group' },
          { id: 'btn-v5-hash', name: 'button', version: 'v5', section: 'components', category: 'action', groupId: 'btn-group' }
        ],
        versions: {
          v6: { uri: 'patternfly://docs/button?version=v6', isSchemasAvailable: true },
          v5: { uri: 'patternfly://docs/button?version=v5', isSchemasAvailable: false }
        }
      }],
      ['modal', {
        name: 'modal',
        groupId: 'mdl-group',
        entries: [{ id: 'mdl-v6-hash', name: 'modal', version: 'v6', section: 'components', category: 'view', groupId: 'mdl-group' }],
        versions: { v6: { uri: 'patternfly://docs/modal?version=v6', isSchemasAvailable: true } }
      }]
    ]),
    keywordsIndex: [
      'button',
      'modal',
      'btn-v6-hash',
      'mdl-v6-hash',
      'patternfly://docs/button',
      'patternfly://docs/modal'
    ],
    keywordsMap: new Map([
      ['button', new Map([['v6', ['button']], ['v5', ['button']]])],
      ['modal', new Map([['v6', ['modal']]])],
      ['btn-v6-hash', new Map([['v6', ['button']]])],
      ['mdl-v6-hash', new Map([['v6', ['modal']]])],
      ['patternfly://docs/button', new Map([['v6', ['button']], ['v5', ['button']]])],
      ['patternfly://docs/modal', new Map([['v6', ['modal']]])]
    ]),
    latestVersion: 'v6'
  };

  const mockOptions = { mcpResources: Promise.resolve(mockMcpResources) as any };

  it.each([
    {
      description: 'exact match',
      search: 'button',
      expectedLength: 1,
      expectedName: 'button',
      expectedType: 'exact'
    },
    {
      description: 'partial prefix',
      search: 'but',
      expectedLength: 1,
      expectedName: 'button',
      expectedType: 'prefix'
    },
    {
      description: 'partial suffix',
      search: 'ton',
      expectedLength: 1,
      expectedName: 'button',
      expectedType: 'suffix'
    },
    {
      description: 'partial contains',
      search: 'utto',
      expectedLength: 1,
      expectedName: 'button',
      expectedType: 'contains'
    },
    {
      description: 'patternfly:// URI',
      search: 'patternfly://docs/modal',
      expectedLength: 1,
      expectedName: 'modal',
      expectedType: 'exact'
    },
    {
      description: 'hash entry id without filter',
      search: 'btn-v6-hash',
      options: {},
      expectedLength: 2,
      expectedName: 'button',
      expectedType: 'exact'
    },
    {
      description: 'version filter',
      search: 'button',
      filters: { version: 'v5' },
      expectedLength: 1,
      expectedName: 'button',
      expectedType: 'exact'
    }
  ])('should return search results, $description', async ({ search, filters, options, expectedLength, expectedName, expectedType }) => {
    const { searchResults } = await searchPatternFly(search, { ...filters }, { ...options, ...mockOptions });

    expect(searchResults?.length).toBe(expectedLength);
    expect(searchResults?.[0]?.matchType).toBe(expectedType);
    expect(searchResults?.[0]?.name).toBe(expectedName);
  });

  it.each([
    {
      description: 'wildcard search',
      search: '*'
    },
    {
      description: 'all search',
      search: 'all'
    },
    {
      description: 'empty all search',
      search: ''
    }
  ])('should return an array of all available results, $description', async ({ search }) => {
    const { searchResults } = await searchPatternFly(search, undefined, { allowWildCardAll: true, ...mockOptions });

    expect(searchResults?.length).toBe(2);
    expect(searchResults?.[0]?.matchType).toBe('all');
  });
});
