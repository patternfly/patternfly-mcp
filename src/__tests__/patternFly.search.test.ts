import {
  dynamicFilterPatternFly,
  filterPatternFly,
  searchPatternFly,
  type FilterPatternFlyFilters
} from '../patternFly.search';

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

  it('should return no results when signal is already aborted before the resource loop', async () => {
    const controller = new AbortController();

    controller.abort();

    const result = await filterPatternFly(undefined, mockResources as any, { signal: controller.signal });

    expect(result.byEntry).toEqual([]);
    expect(result.byResource.size).toBe(0);
  });

  it('should throw signalError when aborted during entry filtering', async () => {
    const controller = new AbortController();
    const signalError = new DOMException('Filter operation aborted', 'AbortError');

    controller.abort();

    await expect(
      filterPatternFly(undefined, mockResources as any, { signal: controller.signal, signalError })
    ).rejects.toBe(signalError);
  });
});

describe('filterPatternFly.memo', () => {
  const mockResources = new Map([
    ['button', {
      name: 'button',
      entries: [
        { name: 'button', section: 'components', category: 'action', version: 'v6' }
      ]
    }],
    ['modal', {
      name: 'modal',
      entries: [
        { name: 'modal', section: 'components', category: 'view', version: 'v6' }
      ]
    }]
  ]);

  it('should cache by filters and map for MCP-style calls', async () => {
    const filters = { name: 'moda' };
    const first = filterPatternFly.memo(filters, mockResources as any);
    const second = filterPatternFly.memo(filters, mockResources as any);

    expect(first).toBe(second);
    await expect(first).resolves.toMatchObject({
      byEntry: expect.arrayContaining([expect.objectContaining({ name: 'modal' })])
    });
  });

  it('should not reuse cache across different filters', async () => {
    const first = filterPatternFly.memo({ name: 'moda' }, mockResources as any);
    const second = filterPatternFly.memo({ name: 'button' }, mockResources as any);

    expect(first).not.toBe(second);
    await expect(first).resolves.toMatchObject({
      byEntry: expect.arrayContaining([expect.objectContaining({ name: 'modal' })])
    });
    await expect(second).resolves.toMatchObject({
      byEntry: expect.arrayContaining([expect.objectContaining({ name: 'button' })])
    });
  });

  it('should not reuse cache across different resource maps', async () => {
    const filters = { name: 'moda' };
    const modalOnlyResources = new Map([
      ['modal', {
        name: 'modal',
        entries: [{ name: 'modal', section: 'components', category: 'view', version: 'v6' }]
      }]
    ]);
    const first = filterPatternFly.memo(filters, mockResources as any);
    const second = filterPatternFly.memo(filters, modalOnlyResources as any);

    expect(first).not.toBe(second);
  });

  it('should exclude settings from cache key', async () => {
    const filters = { name: 'modal' };
    const signalError = new DOMException('', 'AbortError');
    const first = filterPatternFly.memo(filters, mockResources as any);
    const second = filterPatternFly.memo(filters, mockResources as any, {
      signal: new AbortController().signal,
      signalError
    });

    expect(first).toBe(second);
    await expect(second).resolves.toMatchObject({
      byEntry: expect.arrayContaining([expect.objectContaining({ name: 'modal' })])
    });
  });
});

describe('dynamicFilterPatternFly', () => {
  const mockResources = new Map([
    ['button', {
      name: 'button',
      entries: [
        { name: 'button', section: 'components', category: 'action', version: 'v6' },
        { name: 'button', section: 'components', category: 'action', version: 'v5' }
      ]
    }],
    ['modal', {
      name: 'modal',
      entries: [
        { name: 'modal', section: 'components', category: 'view', version: 'v6' }
      ]
    }],
    ['card', {
      name: 'card',
      entries: [
        { name: 'card', section: 'layouts', category: 'view', version: 'v6' }
      ]
    }]
  ]);

  it.each([
    {
      description: 'return immediate single match if filters already narrow it down',
      searchQuery: 'ignored',
      filters: { name: 'modal' },
      options: {},
      expectedNames: ['modal']
    },
    {
      description: 'find a single match by applying searchQuery to "name"',
      searchQuery: 'modal',
      filters: {},
      options: { searchFilters: ['name'] },
      expectedNames: ['modal']
    },
    {
      description: 'find a single match by applying searchQuery to "section"',
      searchQuery: 'layouts',
      filters: {},
      options: { searchFilters: ['section'] },
      expectedNames: ['card']
    },
    {
      description: 'fallback to original results when using a broad section',
      searchQuery: 'components',
      filters: {},
      options: { searchFilters: ['name'] },
      expectedNames: ['button', 'button', 'modal', 'card']
    },
    {
      description: 'fallback to original when using a broad category',
      searchQuery: 'view',
      filters: {},
      options: {},
      expectedNames: ['button', 'button', 'modal', 'card']
    },
    {
      description: 'skip iterative filter if useExistingFilters is true and filter is already set',
      searchQuery: 'modal',
      filters: { name: 'button' },
      options: { useExistingFilters: true, searchFilters: ['name'] },
      expectedNames: ['button', 'button']
    },
    {
      description: 'use custom searchFilters with increased max results',
      searchQuery: 'view',
      filters: {},
      options: { searchFilters: ['category'], maxResultsLimit: 2 },
      expectedNames: ['modal', 'card']
    }
  ])('should $description', async ({ searchQuery, filters, options, expectedNames }) => {
    const result = await dynamicFilterPatternFly(
      searchQuery,
      filters as any,
      mockResources as any,
      options as any
    );

    expect(result.byEntry.map(result => result.name)).toEqual(expectedNames);
  });

  it.each([
    {
      description: 'name filter wins and aborts sibling section scans',
      searchQuery: 'modal',
      filters: {},
      options: { searchFilters: ['name', 'section'] as const },
      expectedNames: ['modal']
    },
    {
      description: 'section filter wins and aborts sibling name scans',
      searchQuery: 'layouts',
      filters: {},
      options: { searchFilters: ['section', 'name'] as const },
      expectedNames: ['card']
    }
  ])('should wire parallel filter passes with shared signal when $description', async ({
    searchQuery,
    filters,
    options,
    expectedNames
  }) => {
    const result = await dynamicFilterPatternFly(
      searchQuery,
      filters as any,
      mockResources as any,
      options as any
    );

    expect(result.byEntry.map(entry => entry.name)).toEqual(expectedNames);
  });

  it('should not call filterPatternFly.memo during parallel or fallback passes', async () => {
    const memoSpy = jest.spyOn(filterPatternFly, 'memo');

    await dynamicFilterPatternFly(
      'modal',
      {},
      mockResources as any,
      { searchFilters: ['name', 'section'] }
    );

    await dynamicFilterPatternFly(
      'components',
      {},
      mockResources as any,
      { searchFilters: ['name'] }
    );

    expect(memoSpy).not.toHaveBeenCalled();

    memoSpy.mockRestore();
  });

  it('should cap parallel filter passes when searchFilters exceeds the internal limit', async () => {
    const oversizedFilters = [
      'name',
      'section',
      'category',
      'version',
      'path',
      'name',
      'section',
      'category',
      'version',
      'path',
      'name',
      'section',
      'category',
      'version',
      'path'
    ];

    const result = await dynamicFilterPatternFly(
      'modal',
      {},
      mockResources as any,
      { searchFilters: oversizedFilters as (keyof FilterPatternFlyFilters)[] }
    );

    expect(result.byEntry.map(entry => entry.name)).toEqual(['modal']);
  });

  it('should not return partial results after a parallel pass wins', async () => {
    await dynamicFilterPatternFly(
      'modal',
      {},
      mockResources as any,
      { searchFilters: ['name', 'section'] }
    );

    const result = await dynamicFilterPatternFly(
      'components',
      {},
      mockResources as any,
      { searchFilters: ['name'] }
    );

    expect(result.byEntry.map(entry => entry.name)).toEqual(['button', 'button', 'modal', 'card']);
  });

  it('should fallback to base filter when no pass matches maxResultsLimit', async () => {
    const result = await dynamicFilterPatternFly(
      'components',
      {},
      mockResources as any,
      { searchFilters: ['name'] }
    );

    expect(result.byEntry.map(entry => entry.name)).toEqual(['button', 'button', 'modal', 'card']);
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
      description: 'patternfly:// URI with filter',
      search: 'patternfly://docs/modal',
      options: { dynamicFilter: true },
      expectedLength: 1,
      expectedName: 'modal',
      expectedType: 'exact'
    },
    {
      description: 'patternfly:// URI without filter',
      search: 'patternfly://docs/modal',
      expectedLength: 1,
      expectedName: 'modal',
      expectedType: 'exact'
    },
    {
      description: 'hash entry id with filter',
      search: 'btn-v6-hash',
      options: { dynamicFilter: true },
      expectedLength: 1,
      expectedName: 'button',
      expectedType: 'exact'
    },
    {
      description: 'hash entry id without filter',
      search: 'btn-v6-hash',
      options: { dynamicFilter: false },
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

  it('should not call filterPatternFly.memo when dynamicFilter is enabled', async () => {
    const memoSpy = jest.spyOn(filterPatternFly, 'memo');

    await searchPatternFly('patternfly://docs/modal', {}, { dynamicFilter: true, ...mockOptions });

    expect(memoSpy).not.toHaveBeenCalled();

    memoSpy.mockRestore();
  });

  it('should call filterPatternFly.memo for scoped non-dynamic filtering', async () => {
    const memoSpy = jest.spyOn(filterPatternFly, 'memo');

    await searchPatternFly('button', {}, mockOptions);

    expect(memoSpy).toHaveBeenCalledTimes(1);
    expect(memoSpy).toHaveBeenCalledWith({}, expect.any(Map));

    memoSpy.mockRestore();
  });

  it('should reuse filterPatternFly.memo cache for repeated identical scoped searches', async () => {
    const memoSpy = jest.spyOn(filterPatternFly, 'memo');

    const first = searchPatternFly('button', {}, mockOptions);
    const second = searchPatternFly('button', {}, mockOptions);

    await Promise.all([first, second]);

    expect(memoSpy).toHaveBeenCalledTimes(2);
    expect(memoSpy.mock.results[0]?.value).toBe(memoSpy.mock.results[1]?.value);

    memoSpy.mockRestore();
  });
});
