import { searchPatternFly } from '../patternFly.search';

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
    const { searchResults, ...rest } = await searchPatternFly(search, { allowWildCardAll: true });

    expect(searchResults.length).toBeGreaterThan(0);
    expect(Object.keys(rest)).toMatchSnapshot('keys');
  });

  it.each([
    {
      description: 'exact match',
      search: 'button',
      matchType: 'exact'
    },
    {
      description: 'partial prefix match',
      search: 'bu',
      matchType: 'prefix'
    },
    {
      description: 'partial suffix match',
      search: 'tton',
      matchType: 'suffix'
    },
    {
      description: 'partial contains match',
      search: 'utt',
      matchType: 'contains'
    }
  ])('should attempt to match components and keywords, $description', async ({ search, matchType }) => {
    const { searchResults } = await searchPatternFly(search);

    expect(searchResults.filter(({ matchType: returnMatchType }) => returnMatchType === matchType)).toEqual([
      expect.objectContaining({
        item: expect.stringContaining(search),
        query: expect.stringMatching(search)
      })
    ]);
  });
});
