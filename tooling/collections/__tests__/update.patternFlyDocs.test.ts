import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { type PatternFlyMcpDocsCatalog } from '../../../src/docs.embedded';
import {
  DEFAULT_DOCS_FILENAME,
  logDiffReport,
  run
} from '../update.patternFlyDocs';
import { fetchLatestRepoHashes, getSrcPath, writeJsonCollection } from '../helpers';
import { saveCsvReport } from '../csv';
import { findApiRedundantDocs, type DocsDiffResult } from '../update.patternFlyDocsHelpers';

jest.mock('node:fs', () => ({
  ...jest.requireActual('node:fs'),
  existsSync: jest.fn((path: string) => (typeof path === 'string' && path.startsWith('/mock/')) || jest.requireActual('node:fs').existsSync(path))
}));

jest.mock('node:fs/promises', () => ({
  ...jest.requireActual('node:fs/promises'),
  readFile: jest.fn()
}));

jest.mock('../helpers', () => ({
  ...jest.requireActual('../helpers'),
  fetchLatestRepoHashes: jest.fn(),
  writeJsonCollection: jest.fn()
}));

jest.mock('../csv', () => ({
  ...jest.requireActual('../csv'),
  saveCsvReport: jest.fn()
}));

const DOCS_PATH = getSrcPath(DEFAULT_DOCS_FILENAME);
const mockReadFile = readFile as jest.MockedFunction<typeof readFile>;
const mockWriteJsonCollection = writeJsonCollection as jest.MockedFunction<typeof writeJsonCollection>;

describe('collection.patternFlyDocs', () => {
  it('should export the run function for programmatic invocation', () => {
    expect(typeof run).toBe('function');
  });

  it('should have a generated documentation manifest file', () => {
    expect(existsSync(DOCS_PATH)).toBe(true);
  });

  it('should have a consistent JSON schema and correct metadata counts', () => {
    const raw = readFileSync(DOCS_PATH, 'utf-8');
    const collection: PatternFlyMcpDocsCatalog = JSON.parse(raw);

    expect(collection).toMatchObject({
      version: expect.any(String),
      generated: expect.any(String),
      meta: {
        totalEntries: expect.any(Number),
        totalDocs: expect.any(Number),
        source: expect.any(String)
      },
      docs: expect.any(Object)
    });

    const totalEntries = Object.keys(collection.docs).length;
    const totalDocs = Object.values(collection.docs).reduce((acc, arr) => acc + arr.length, 0);

    expect(collection.meta.totalEntries).toBe(totalEntries);
    expect(collection.meta.totalDocs).toBe(totalDocs);
  });

  it('should have records that are properly formatted with key properties', () => {
    const raw = readFileSync(DOCS_PATH, 'utf-8');
    const collection: PatternFlyMcpDocsCatalog = JSON.parse(raw);
    const sample = Object.values(collection.docs).flatMap(docs => docs).slice(0, 50);

    expect(sample.length).toBeGreaterThan(0);
    for (const record of sample) {
      expect(typeof record.displayName).toBe('string');
      expect(typeof record.description).toBe('string');
      expect(typeof record.pathSlug).toBe('string');
      expect(typeof record.section).toBe('string');
      expect(typeof record.category).toBe('string');
      expect(typeof record.source).toBe('string');
      expect(typeof record.path).toBe('string');
      expect(typeof record.version).toBe('string');

      expect(record.path.startsWith('http')).toBe(true);
    }
  });
});

describe('logDiffReport', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should log structured diff summary with formatted additions, removals, and modifications', () => {
    const sampleDiff: DocsDiffResult = {
      added: [
        {
          category: 'Components',
          record: {
            displayName: 'Button',
            pathSlug: 'button',
            path: 'https://raw.githubusercontent.com/patternfly/patternfly-react/sha/button.md',
            category: 'react',
            description: '',
            section: 'components',
            source: 'github',
            version: 'v6'
          }
        }
      ],
      removed: [
        {
          category: 'AI',
          record: {
            displayName: 'Table Rules',
            pathSlug: 'table-rules',
            path: 'https://raw.githubusercontent.com/rh-uxd/ai-helpers/sha/table.md',
            category: 'AI',
            description: '',
            section: 'guidelines',
            source: 'github',
            version: 'v6'
          },
          reason: 'superseded by API collection',
          details: 'v6/AI/development-guidelines_table/text'
        }
      ],
      modified: [
        {
          category: 'Alert',
          record: {
            displayName: 'Alert',
            pathSlug: 'alert',
            path: 'https://raw.githubusercontent.com/patternfly/patternfly-org/new/alert.md',
            category: 'react',
            description: '',
            section: 'components',
            source: 'github',
            version: 'v6'
          },
          reasons: ['hash update (old -> new)']
        }
      ],
      unchanged: []
    };

    logDiffReport(sampleDiff);

    expect(consoleSpy).toHaveBeenCalledWith('\n📊 PatternFly Docs Collection Diff Report:');
  });
});

describe('run', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  // Mock catalog with both standard component docs and AI marketplace docs
  const mockCatalog: PatternFlyMcpDocsCatalog = {
    version: '1',
    generated: '2026-01-01T00:00:00.000Z',
    meta: { totalEntries: 1, totalDocs: 1, source: 'patternfly-mcp' },
    docs: {
      Button: [
        {
          displayName: 'Button',
          pathSlug: 'button',
          path: 'https://raw.githubusercontent.com/patternfly/patternfly-react/1111111111111111111111111111111111111111/button.md',
          version: 'v6',
          category: 'react',
          description: '',
          section: 'components',
          source: 'github'
        }
      ],
      AIHelpers: [
        {
          displayName: 'AI Helpers README',
          pathSlug: 'ai-helpers-readme',
          path: 'https://raw.githubusercontent.com/rh-uxd/ai-helpers/1111111111111111111111111111111111111111/README.md',
          version: 'v6',
          category: 'AI',
          description: 'Agent marketplace description',
          section: 'guidelines',
          source: 'github'
        }
      ]
    }
  };

  const mockApiCollection = {
    records: [
      { p: 'v6/AI/ai-assisted-development_marketplace/text', q: 1.0 }
    ]
  };

  beforeEach(() => {
    jest.clearAllMocks();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    mockReadFile.mockResolvedValue(JSON.stringify(mockCatalog));
    (fetchLatestRepoHashes as jest.MockedFunction<typeof fetchLatestRepoHashes>).mockResolvedValue(
      new Map([['patternfly/patternfly-react', '2222222222222222222222222222222222222222']])
    );
    mockWriteJsonCollection.mockResolvedValue({
      jsonContent: '{}',
      sizeKb: '1.0',
      durationSec: '0.1'
    });
    (saveCsvReport as jest.MockedFunction<typeof saveCsvReport>).mockResolvedValue(undefined);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('should default pruneApiOverlap to false and preserve overlapping documentation records', async () => {
    const diff = await run({ docsPath: '/mock/docs.json', outputCsv: false });

    expect(diff).toMatchObject({
      added: expect.any(Array),
      removed: expect.any(Array),
      modified: expect.any(Array),
      unchanged: expect.any(Array)
    });

    // Overlap pruning is disabled by default: no records removed
    expect(diff.removed).toHaveLength(0);

    // API file read should not have been attempted
    expect(mockReadFile).toHaveBeenCalledTimes(1);
    expect(mockReadFile).toHaveBeenCalledWith('/mock/docs.json', 'utf-8');
  });

  it('should prune API redundant records when pruneApiOverlap is explicitly enabled', async () => {
    mockReadFile
      .mockResolvedValueOnce(JSON.stringify(mockCatalog))
      .mockResolvedValueOnce(JSON.stringify(mockApiCollection));

    const diff = await run({
      docsPath: '/mock/docs.json',
      apiPath: '/mock/api.json',
      pruneApiOverlap: true,
      updateHashes: false,
      outputCsv: false
    });

    expect(mockReadFile).toHaveBeenCalledWith('/mock/docs.json', 'utf-8');
    expect(mockReadFile).toHaveBeenCalledWith('/mock/api.json', 'utf-8');

    // ai-helpers-readme should be identified and removed as superseded
    expect(diff.removed).toHaveLength(1);
    expect(diff.removed[0]?.record.pathSlug).toBe('ai-helpers-readme');
    expect(diff.removed[0]?.reason).toBe('superseded by API collection');
  });

  it('should preserve docs and skip API reading when pruneApiOverlap is explicitly false', async () => {
    const diff = await run({
      docsPath: '/mock/docs.json',
      apiPath: '/mock/api.json',
      pruneApiOverlap: false,
      updateHashes: false,
      outputCsv: false
    });

    expect(mockReadFile).toHaveBeenCalledTimes(1);
    expect(mockReadFile).toHaveBeenCalledWith('/mock/docs.json', 'utf-8');
    expect(diff.removed).toHaveLength(0);
  });

  it('should sync commit hashes by default when updateHashes is not disabled', async () => {
    await run({ docsPath: '/mock/docs.json', outputCsv: false });

    expect(fetchLatestRepoHashes).toHaveBeenCalledTimes(1);
    expect(mockWriteJsonCollection).toHaveBeenCalled();

    const savedCollection = mockWriteJsonCollection.mock.calls[0]?.[1] as PatternFlyMcpDocsCatalog;

    expect(savedCollection.docs.Button?.[0]?.path).toContain('2222222222222222222222222222222222222222');
  });

  it('should bypass commit hash updates when updateHashes is false', async () => {
    await run({ docsPath: '/mock/docs.json', updateHashes: false, outputCsv: false });

    expect(fetchLatestRepoHashes).not.toHaveBeenCalled();

    const savedCollection = mockWriteJsonCollection.mock.calls[0]?.[1] as PatternFlyMcpDocsCatalog;

    expect(savedCollection.docs.Button?.[0]?.path).toContain('1111111111111111111111111111111111111111');
  });

  it('should generate and save CSV report by default or when outputCsv is true', async () => {
    await run({
      docsPath: '/mock/docs.json',
      csvOutputPath: '/mock/output.csv',
      outputCsv: true
    });

    expect(saveCsvReport).toHaveBeenCalledTimes(1);
    expect(saveCsvReport).toHaveBeenCalledWith('/mock/output.csv', expect.any(String));
  });

  it('should skip CSV report generation when outputCsv is false', async () => {
    await run({ docsPath: '/mock/docs.json', outputCsv: false });

    expect(saveCsvReport).not.toHaveBeenCalled();
  });

  it('should write JSON collection with correct stats and format flags', async () => {
    await run({
      docsPath: '/mock/custom-docs.json',
      isPrettyPrint: true,
      outputCsv: false
    });

    expect(mockWriteJsonCollection).toHaveBeenCalledWith(
      '/mock/custom-docs.json',
      expect.any(Object),
      expect.objectContaining({
        isPrettyPrint: true,
        stats: expect.arrayContaining([
          { label: 'Total Categories', value: expect.any(Number) },
          { label: 'Total Documents', value: expect.any(Number) }
        ])
      })
    );
  });

  it('should safely handle and ignore malformed API JSON without failing the run', async () => {
    mockReadFile
      .mockResolvedValueOnce(JSON.stringify(mockCatalog))
      .mockResolvedValueOnce('invalid json');

    const diff = await run({ pruneApiOverlap: true, updateHashes: false, outputCsv: false });

    expect(diff).toBeDefined();
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Could not parse API collection'));
  });
});

describe('API Deduplication Regression Guard (Deterministic Fixtures)', () => {
  const fixtureDocs: PatternFlyMcpDocsCatalog = {
    version: '1',
    generated: '2026-01-01T00:00:00.000Z',
    meta: {
      totalEntries: 2,
      totalDocs: 5,
      source: 'patternfly-mcp'
    },
    docs: {
      AIHelpers: [
        {
          displayName: 'AI Helpers README',
          pathSlug: 'ai-helpers-readme',
          path: 'https://raw.githubusercontent.com/rh-uxd/ai-helpers/main/README.md',
          version: 'v6',
          category: 'AI',
          description: 'Marketplace guide',
          section: 'guidelines',
          source: 'github'
        },
        {
          displayName: 'Table Rules',
          pathSlug: 'table-rules',
          path: 'https://raw.githubusercontent.com/rh-uxd/ai-helpers/main/docs/components/data-display/table.md',
          version: 'v6',
          category: 'AI',
          description: 'Table guidelines',
          section: 'guidelines',
          source: 'github'
        },
        {
          displayName: 'Unindexed Doc',
          pathSlug: 'unindexed-guideline',
          path: 'https://raw.githubusercontent.com/rh-uxd/ai-helpers/main/docs/unindexed.md',
          version: 'v6',
          category: 'AI',
          description: 'Unindexed document',
          section: 'guidelines',
          source: 'github'
        },
        {
          displayName: 'UXD Preserved Style Guide',
          pathSlug: 'uxd-ai-helpers-style-guide',
          path: 'https://raw.githubusercontent.com/rh-uxd/ai-helpers/main/docs/style-guide.md',
          version: 'v6',
          category: 'AI',
          description: 'UXD style guide',
          section: 'guidelines',
          source: 'github'
        }
      ],
      Ecosystem: [
        {
          displayName: 'CLI Guide',
          pathSlug: 'patternfly-cli-readme',
          path: 'https://raw.githubusercontent.com/patternfly/patternfly-cli/main/README.md',
          version: 'v6',
          category: 'tooling',
          description: 'CLI tool documentation',
          section: 'ecosystem',
          source: 'github'
        }
      ]
    }
  };

  const fixtureApiRecords = [
    { p: 'v6/AI/ai-assisted-development_marketplace/text', q: 1.0 },
    { p: 'v6/AI/development-guidelines_table/text', q: 1.0 }
  ];

  it('should detect redundant AI-helper entries matching qualifying high-quality API endpoints', () => {
    const redundant = findApiRedundantDocs(fixtureDocs, fixtureApiRecords);

    expect(redundant).toHaveLength(2);

    const redundantSlugs = redundant.map(report => report.record.pathSlug);

    expect(redundantSlugs).toContain('ai-helpers-readme');
    expect(redundantSlugs).toContain('table-rules');

    for (const item of redundant) {
      expect(item.reason).toBe('superseded by API collection');
      expect(item.details).toBeDefined();
    }
  });

  it('should preserve root AIHelpers guides and ecosystem repositories without false positives', () => {
    const redundant = findApiRedundantDocs(fixtureDocs, fixtureApiRecords);
    const redundantSlugs = new Set(redundant.map(report => report.record.pathSlug));

    // Unmatched AI helper documents must NOT be marked redundant
    expect(redundantSlugs.has('unindexed-guideline')).toBe(false);

    // Negative boundary: uxd-ai-helpers-* prefix must be preserved
    expect(redundantSlugs.has('uxd-ai-helpers-style-guide')).toBe(false);

    // Negative boundary: ecosystem repos must be preserved
    expect(redundantSlugs.has('patternfly-cli-readme')).toBe(false);
  });

  it('should return empty array when API records list is empty or undefined', () => {
    expect(findApiRedundantDocs(fixtureDocs, [])).toEqual([]);
    expect(findApiRedundantDocs(fixtureDocs, undefined)).toEqual([]);
  });
});
