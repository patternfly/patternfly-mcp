import { paramCompletion } from '../resource.helpers';
import { filterPatternFly } from '../patternFly.search';
import { normalizeEnumeratedPatternFlyVersion } from '../patternFly.helpers';

jest.mock('../patternFly.search', () => ({
  ...jest.requireActual('../patternFly.search'),
  filterPatternFly: { memo: jest.fn() }
}));

jest.mock('../patternFly.helpers', () => ({
  ...jest.requireActual('../patternFly.helpers'),
  normalizeEnumeratedPatternFlyVersion: { memo: jest.fn() }
}));

const MockFilter = filterPatternFly.memo as jest.MockedFunction<typeof filterPatternFly.memo>;
const MockNormalizeVersion = normalizeEnumeratedPatternFlyVersion.memo as jest.MockedFunction<typeof normalizeEnumeratedPatternFlyVersion.memo>;

describe('paramCompletion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    {
      description: 'aggregates, sorts, and de-duplicates fields',
      version: 'v6',
      byEntry: [
        { name: 'Table', category: 'data', section: 'components', version: 'v6', uriSchemas: 'patternfly://schemas/v6/table' },
        { name: 'Button', category: 'actions', section: 'components', version: 'v6', uriSchemas: undefined },
        { name: 'Button', category: 'actions', section: 'components', version: 'v6', uriSchemas: undefined }
      ],
      expected: {
        names: ['Button', 'Table'],
        categories: ['actions', 'data'],
        sections: ['components'],
        versions: ['v6'],
        schemas: ['Table']
      }
    },
    {
      description: 'returns empty arrays when there are no entries',
      version: undefined,
      byEntry: [],
      expected: { names: [], categories: [], sections: [], versions: [], schemas: [] }
    },
    {
      description: 'skips non-string fields',
      version: 'v6',
      byEntry: [
        { name: 123, category: null, section: undefined, version: 'v6', uriSchemas: 'x' }
      ],
      expected: { names: [], categories: [], sections: [], versions: ['v6'], schemas: [] }
    }
  ])('should return completion sets, $description', async ({ version, byEntry, expected }) => {
    MockFilter.mockResolvedValue({ byEntry, byResource: new Map() } as any);

    const result = await paramCompletion({ version, category: '', section: 'components' });

    expect(MockNormalizeVersion).toHaveBeenCalledWith(version);
    expect(result).toEqual(expected);
  });

  it('should normalize the version and forward filters to filterPatternFly', async () => {
    MockNormalizeVersion.mockResolvedValue('v6' as any);
    MockFilter.mockResolvedValue({ byEntry: [], byResource: new Map() } as any);

    await paramCompletion({ version: 'latest', category: 'button', section: 'components' });

    expect(MockNormalizeVersion).toHaveBeenCalledWith('latest');
    expect(MockFilter).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'button', section: 'components', version: 'v6' })
    );
  });

  it('should fall back to the raw filters.version when normalization returns falsy', async () => {
    MockFilter.mockResolvedValue({ byEntry: [], byResource: new Map() } as any);

    await paramCompletion({ version: 'v6', section: 'components' });

    expect(MockFilter).toHaveBeenCalledWith(
      expect.objectContaining({ version: 'v6' })
    );
  });
});
