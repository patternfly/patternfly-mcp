import { filterPatternFly, searchPatternFly } from '../patternFly.search';
import { installGithubFetchMock, restoreNativeFetch } from './fixtures/mockGithubFetch';

describe('filterPatternFly', () => {
  it.each([
    {
      description: 'all filter',
      filters: undefined
    },
    {
      description: 'all filter empty object',
      filters: {}
    },
    {
      description: 'all filter empty object',
      filters: { version: 'v5' }
    },
    {
      description: 'section, components',
      filters: { section: 'components' }
    },
    {
      description: 'category, accessibility',
      filters: { category: 'accessibility' }
    }
  ])('should attempt to return filtered results, $description', async ({ filters }) => {
    const result = await filterPatternFly(filters as any);

    expect(result.byEntry.length).toBeGreaterThanOrEqual(0);
    expect(Array.from(result.byResource).length).toBeGreaterThanOrEqual(0);
  });

  it('should attempt to filter number results', async () => {
    const result = await filterPatternFly(
      { section: 1 } as any,
      new Map([['loremIpsum', { entries: [{ section: 1 }, { section: 'dolor' }] }]]) as any
    );

    expect(result.byEntry).toEqual(expect.arrayContaining([{ section: 1 }]));
    expect(Array.from(result.byResource).length).toBeGreaterThanOrEqual(0);
  });
});

describe('searchPatternFly', () => {
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
  ])('should attempt to return an array of all available results, $description', async ({ search }) => {
    const { searchResults, ...rest } = await searchPatternFly(search, undefined, { allowWildCardAll: true });

    expect(searchResults.length).toBeGreaterThan(0);
    expect(Object.keys(rest)).toMatchSnapshot('keys');
  });

  it.each([
    {
      description: 'exact match',
      search: 'react',
      matchType: 'exact'
    },
    {
      description: 'partial prefix match',
      search: 're',
      matchType: 'prefix'
    },
    {
      description: 'partial suffix match',
      search: 'act',
      matchType: 'suffix'
    },
    {
      description: 'partial contains match',
      search: 'eac',
      matchType: 'contains'
    }
  ])('should attempt to match components and keywords, $description', async ({ search, matchType }) => {
    const { searchResults } = await searchPatternFly(search);

    expect(searchResults.find(({ matchType: returnMatchType }) => returnMatchType === matchType)).toEqual(expect.objectContaining({
      query: expect.stringMatching(search)
    }));
  });

  it.each([
    {
      description: 'version',
      search: 'about modal',
      filters: { version: 'v5' }
    },
    {
      description: 'section',
      search: 'popover',
      filters: { section: 'components' }
    },
    {
      description: 'category',
      search: '*',
      filters: { category: 'grammar' },
      options: { allowWildCardAll: true }
    }
  ])('should allow filtering, $description', async ({ search, filters, options }) => {
    const { searchResults, totalResults, totalPotentialMatches } = await searchPatternFly(search, filters, options || {});

    expect(searchResults.length).toBeGreaterThanOrEqual(0);
    expect(totalResults).toBeGreaterThanOrEqual(searchResults.length);
    expect(totalPotentialMatches).toBeGreaterThanOrEqual(totalResults);
  });
});

describe('searchPatternFly, AiGuidelines catalog', () => {
  beforeAll(() => installGithubFetchMock());
  afterAll(() => restoreNativeFetch());
  const feltPath = (paths: { path?: string }[]) =>
    paths.some(entry => typeof entry.path === 'string' && entry.path.includes('project-felt/ai-guidelines'));

  it('should exact-match resource aiguidelines for query AiGuidelines', async () => {
    const { exactMatches, searchResults } = await searchPatternFly('AiGuidelines');

    const byName = new Map(searchResults.map(result => [result.name, result]));
    const aiGuidelinesResource = byName.get('aiguidelines');

    expect(aiGuidelinesResource).toBeDefined();
    expect(exactMatches.some(match => match.name === 'aiguidelines')).toBe(true);
    expect(feltPath(aiGuidelinesResource!.entries)).toBe(true);
    expect(aiGuidelinesResource!.entries.length).toBeGreaterThanOrEqual(7);
  });

  it('should exact-match resource aiguidelines for query aiguidelines', async () => {
    const { exactMatches } = await searchPatternFly('aiguidelines');

    expect(exactMatches.some(match => match.name === 'aiguidelines')).toBe(true);
  });

  it.each([
    { description: 'transparency wording', search: 'transparency notices' },
    { description: 'chatbot avatars display name fragment', search: 'chatbot avatars' },
    { description: 'legal requirements description fragment', search: 'legal review' }
  ])('should surface project-felt AiGuidelines URLs when searching $description', async ({ search }) => {
    const { searchResults } = await searchPatternFly(search);

    const hitsFelt = searchResults.some(result => feltPath(result.entries));

    expect(hitsFelt).toBe(true);
  });
});
