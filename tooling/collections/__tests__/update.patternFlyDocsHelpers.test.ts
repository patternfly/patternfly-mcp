import { type PatternFlyMcpDocsCatalog } from '../../../src/docs.embedded';
import {
  AI_GUIDELINE_ALIASES,
  PINNED_HISTORICAL_REFS,
  diffDocsManifests,
  findApiRedundantDocs,
  generateReportCsv,
  recalculateManifestMetadata,
  resolveApiEndpointForAiDoc
} from '../update.patternFlyDocsHelpers';
import { verifyUrlReachability } from '../helpers';

describe('AI_GUIDELINE_ALIASES', () => {
  it('should maintain guideline aliases', () => {
    expect(AI_GUIDELINE_ALIASES['table-rules']).toBe('table');
    expect(AI_GUIDELINE_ALIASES['layout-components']).toBe('layout');
    expect(AI_GUIDELINE_ALIASES['development-rules']).toBe('overview');
  });
});

describe('PINNED_HISTORICAL_REFS', () => {
  it('should maintain declarative pinned historical hashes', () => {
    expect(PINNED_HISTORICAL_REFS instanceof Set).toBe(true);
    expect(PINNED_HISTORICAL_REFS.has('ec02b437ec72b6e4cc4e28524516288f4acf9fdf')).toBe(true);
    expect(PINNED_HISTORICAL_REFS.has('e8cca17430a8ccb062ed1878073165417a081b34')).toBe(true);
  });
});

describe('resolveApiEndpointForAiDoc', () => {
  const highQualityApi = [
    { p: 'v6/AI/ai-assisted-development_marketplace/text', q: 1 },
    { p: 'v6/AI/development-guidelines_overview/text', q: 1 },
    { p: 'v6/AI/development-guidelines_table/text', q: 1 },
    { p: 'v6/AI/development-guidelines_charts/text', q: 1 }
  ];

  it.each([
    {
      description: 'README alias matching marketplace endpoint',
      doc: {
        displayName: 'AI Helpers README',
        pathSlug: 'ai-helpers-readme',
        path: 'https://raw.githubusercontent.com/rh-uxd/ai-helpers/main/README.md'
      },
      expected: 'v6/AI/ai-assisted-development_marketplace/text'
    },
    {
      description: 'contributing alias matching marketplace endpoint',
      doc: {
        displayName: 'AI Helpers Contributing',
        pathSlug: 'ai-helpers-contributing',
        path: 'https://raw.githubusercontent.com/rh-uxd/ai-helpers/main/CONTRIBUTING.md'
      },
      expected: 'v6/AI/ai-assisted-development_marketplace/text'
    },
    {
      description: 'table rules alias matching table endpoint',
      doc: {
        displayName: 'Table Rules',
        pathSlug: 'table-rules',
        path: 'https://raw.githubusercontent.com/rh-uxd/ai-helpers/main/docs/components/data-display/table.md'
      },
      expected: 'v6/AI/development-guidelines_table/text'
    },
    {
      description: 'charts token matching charts endpoint via fuzzy lookup',
      doc: {
        displayName: 'Charts Rules',
        pathSlug: 'charts',
        path: 'https://raw.githubusercontent.com/rh-uxd/ai-helpers/main/docs/charts/README.md'
      },
      expected: 'v6/AI/development-guidelines_charts/text'
    }
  ])('should resolve AI endpoint, $description', ({ doc, expected }) => {
    const fullDoc = {
      version: 'v6',
      category: 'AI',
      description: '',
      section: '',
      source: 'github' as const,
      ...doc
    };

    expect(resolveApiEndpointForAiDoc(fullDoc, highQualityApi)).toBe(expected);
  });

  it('should return undefined when no qualifying API endpoint matches', () => {
    const unindexedDoc = {
      displayName: 'Unindexed Doc',
      pathSlug: 'unindexed-guideline',
      path: 'https://raw.githubusercontent.com/rh-uxd/ai-helpers/main/docs/unindexed.md',
      version: 'v6',
      category: 'AI',
      description: '',
      section: '',
      source: 'github' as const
    };

    expect(resolveApiEndpointForAiDoc(unindexedDoc, [])).toBeUndefined();
    expect(resolveApiEndpointForAiDoc(unindexedDoc, highQualityApi)).toBeUndefined();
  });

  it('should return undefined when document is not an AI helper docs path', () => {
    const nonDocsEntry = {
      displayName: 'Generic Doc',
      pathSlug: 'generic-doc',
      path: 'https://raw.githubusercontent.com/rh-uxd/ai-helpers/main/scripts/run.md',
      version: 'v6',
      category: 'AI',
      description: '',
      section: '',
      source: 'github' as const
    };

    expect(resolveApiEndpointForAiDoc(nonDocsEntry, highQualityApi)).toBeUndefined();
  });
});

describe('findApiRedundantDocs', () => {
  const sampleCatalog: PatternFlyMcpDocsCatalog = {
    version: '1',
    generated: '2026-01-01T00:00:00.000Z',
    meta: { totalEntries: 3, totalDocs: 5, source: 'patternfly-mcp' },
    docs: {
      AIHelpers: [
        {
          displayName: 'AI Helpers README',
          pathSlug: 'ai-helpers-readme',
          path: 'https://raw.githubusercontent.com/rh-uxd/ai-helpers/main/README.md',
          version: 'v6',
          category: 'AI',
          description: '',
          section: '',
          source: 'github'
        },
        {
          displayName: 'Table Rules',
          pathSlug: 'table-rules',
          path: 'https://raw.githubusercontent.com/rh-uxd/ai-helpers/main/docs/components/data-display/table.md',
          version: 'v6',
          category: 'AI',
          description: '',
          section: '',
          source: 'github'
        },
        {
          displayName: 'UXD Preserved Guide',
          pathSlug: 'uxd-ai-helpers-guideline',
          path: 'https://raw.githubusercontent.com/rh-uxd/ai-helpers/main/docs/guidelines.md',
          version: 'v6',
          category: 'AI',
          description: '',
          section: '',
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
          description: '',
          section: '',
          source: 'github'
        }
      ]
    }
  };

  const apiRecords = [
    { p: 'v6/AI/ai-assisted-development_marketplace/text', q: 1.0 },
    { p: 'v6/AI/development-guidelines_table/text', q: 1.0 },
    { p: 'v6/AI/development-guidelines_low_quality/text', q: 0.8 }
  ];

  it('should detect redundant documents when qualifying high-quality API endpoints match', () => {
    const redundant = findApiRedundantDocs(sampleCatalog, apiRecords);
    const redundantSlugs = redundant.map(item => item.record.pathSlug);

    expect(redundant).toHaveLength(2);
    expect(redundantSlugs).toContain('ai-helpers-readme');
    expect(redundantSlugs).toContain('table-rules');
  });

  it('should strictly preserve negative control boundaries and ecosystem repositories', () => {
    const redundant = findApiRedundantDocs(sampleCatalog, apiRecords);
    const removedSlugs = new Set(redundant.map(item => item.record.pathSlug));

    expect(removedSlugs.has('uxd-ai-helpers-guideline')).toBe(false);
    expect(removedSlugs.has('patternfly-cli-readme')).toBe(false);
  });

  it('should return empty array when API records list is empty or undefined', () => {
    expect(findApiRedundantDocs(sampleCatalog, [])).toEqual([]);
    expect(findApiRedundantDocs(sampleCatalog, undefined)).toEqual([]);
  });
});

describe('generateReportCsv', () => {
  it('should produce a full structured CSV report for added, removed, modified, and unchanged doc entries', () => {
    const diff = {
      added: [
        {
          category: 'NewCat',
          record: {
            displayName: 'New Doc',
            description: 'New Description',
            pathSlug: 'new-doc',
            section: 'components',
            category: 'react',
            source: 'github',
            path: 'https://raw.githubusercontent.com/patternfly/patternfly-react/831257aa7c49c3238e0f7afbb7cf219c62cd9e23/README.md',
            version: 'v6'
          },
          reason: 'new upstream document',
          details: 'Discovered in manifest update'
        }
      ],
      removed: [
        {
          category: 'React',
          record: {
            displayName: 'Table Rules',
            description: 'Old Table Rules',
            pathSlug: 'table-rules',
            section: 'components',
            category: 'react',
            source: 'github',
            path: 'https://raw.githubusercontent.com/patternfly/ai-helpers/f7f8160c3f28b0bc7f64181d9466a425ac8329fc/docs/components/data-display/table.md',
            version: 'v6'
          },
          reason: 'superseded by API collection',
          details: 'v6/AI/development-guidelines_table/text'
        }
      ],
      modified: [
        {
          category: 'Button',
          record: {
            displayName: 'Button Design',
            description: 'Button design guidelines',
            pathSlug: 'button-design',
            section: 'components',
            category: 'design-guidelines',
            source: 'github',
            path: 'https://raw.githubusercontent.com/patternfly/patternfly-org/540bb0d31cb18670dd02857f80aa8b444fed9be9/Button.md',
            version: 'v6'
          },
          reasons: ['hash update (9577561 -> 540bb0d)'],
          previousHash: '957756128e8ddfc4be5db49e72312a2c43b9d220',
          newHash: '540bb0d31cb18670dd02857f80aa8b444fed9be9'
        }
      ],
      unchanged: [
        {
          category: 'Alert',
          record: {
            displayName: 'Alert Design',
            description: 'Alert design guidelines',
            pathSlug: 'alert-design',
            section: 'components',
            category: 'design-guidelines',
            source: 'github',
            path: 'https://raw.githubusercontent.com/patternfly/patternfly-org/540bb0d31cb18670dd02857f80aa8b444fed9be9/Alert.md',
            version: 'v6'
          }
        }
      ]
    };

    const csv = generateReportCsv({ diff });
    const lines = csv.trim().split('\n');

    expect(lines[0]).toBe('status,category,name,pathSlug,path,previousHash,newHash,reason,details');
    expect(lines.some(line => line.startsWith('ADDED,NewCat,New Doc') && line.includes('new upstream document'))).toBe(true);
    expect(lines.some(line => line.startsWith('REMOVED,React,Table Rules') && line.includes('superseded by API collection'))).toBe(true);
    expect(lines.some(line => line.startsWith('MODIFIED,Button,Button Design') && line.includes('hash update'))).toBe(true);
    expect(lines.some(line => line.startsWith('UNCHANGED,Alert,Alert Design'))).toBe(true);
  });
});

describe('diffDocsManifests', () => {
  it('should diff manifests and categorize added, removed, modified, and unchanged entries', () => {
    const oldCollection: PatternFlyMcpDocsCatalog = {
      meta: { totalEntries: 2, totalDocs: 2, source: 'test' },
      docs: {
        Cat1: [
          {
            displayName: 'Doc A',
            description: 'Desc A',
            pathSlug: 'doc-a',
            section: 'sec',
            category: 'cat',
            source: 'github',
            path: 'https://raw.githubusercontent.com/owner/repo/hash1111111111111111111111111111111111111111/a.md',
            version: 'v6'
          }
        ],
        Cat2: [
          {
            displayName: 'Doc B',
            description: 'Desc B',
            pathSlug: 'doc-b',
            section: 'sec',
            category: 'cat',
            source: 'github',
            path: 'https://raw.githubusercontent.com/owner/repo/hash1111111111111111111111111111111111111111/b.md',
            version: 'v6'
          }
        ]
      }
    };

    const newCollection: PatternFlyMcpDocsCatalog = {
      meta: { totalEntries: 2, totalDocs: 2, source: 'test' },
      docs: {
        Cat1: [
          {
            displayName: 'Doc A',
            description: 'Desc A',
            pathSlug: 'doc-a',
            section: 'sec',
            category: 'cat',
            source: 'github',
            path: 'https://raw.githubusercontent.com/owner/repo/hash2222222222222222222222222222222222222222/a.md',
            version: 'v6'
          }
        ],
        Cat3: [
          {
            displayName: 'Doc C',
            description: 'Desc C',
            pathSlug: 'doc-c',
            section: 'sec',
            category: 'cat',
            source: 'github',
            path: 'https://raw.githubusercontent.com/owner/repo/hash2222222222222222222222222222222222222222/c.md',
            version: 'v6'
          }
        ]
      }
    };

    const diff = diffDocsManifests(oldCollection, newCollection);

    expect(diff.modified.length).toBe(1);
    expect(diff.modified[0]?.record.displayName).toBe('Doc A');
    expect(diff.removed.length).toBe(1);
    expect(diff.removed[0]?.record.displayName).toBe('Doc B');
    expect(diff.added.length).toBe(1);
    expect(diff.added[0]?.record.displayName).toBe('Doc C');
  });
});

describe('recalculateManifestMetadata', () => {
  const sampleCollection: PatternFlyMcpDocsCatalog = {
    version: '1',
    generated: '2026-01-01T00:00:00.000Z',
    meta: {
      totalEntries: 2,
      totalDocs: 2,
      source: 'patternfly-mcp'
    },
    docs: {
      Button: [
        {
          displayName: 'Button Design',
          description: 'Button design guidelines',
          pathSlug: 'button-design',
          section: 'components',
          category: 'design-guidelines',
          source: 'github',
          path: 'https://raw.githubusercontent.com/patternfly/patternfly-org/540bb0d31cb18670dd02857f80aa8b444fed9be9/Button.md',
          version: 'v6'
        }
      ],
      Alert: [
        {
          displayName: 'Alert Design',
          description: 'Alert design guidelines',
          pathSlug: 'alert-design',
          section: 'components',
          category: 'design-guidelines',
          source: 'github',
          path: 'https://raw.githubusercontent.com/patternfly/patternfly-org/540bb0d31cb18670dd02857f80aa8b444fed9be9/Alert.md',
          version: 'v6'
        }
      ]
    }
  };

  it('should recalculate manifest metadata totalEntries and totalDocs accurately', async () => {
    const latestHashes = new Map([
      ['patternfly/patternfly-org', '3333333333333333333333333333333333333333']
    ]);

    const { collection: updated } = await recalculateManifestMetadata(sampleCollection, { latestHashes });

    expect(updated.meta.totalEntries).toBe(2);
    expect(updated.meta.totalDocs).toBe(2);
    expect(updated.docs.Button?.[0]?.path).toContain('3333333333333333333333333333333333333333');
    expect(updated.docs.Alert?.[0]?.path).toContain('3333333333333333333333333333333333333333');
  });

  it('should recalculate metadata and update commit hashes for unpinned repositories', async () => {
    const hashes = new Map<string, string>([
      ['patternfly/patternfly-org', '1111111111111111111111111111111111111111']
    ]);

    const { collection: result } = await recalculateManifestMetadata(sampleCollection, {
      latestHashes: hashes
    });

    expect(result.docs['Button']?.[0]?.path).toBe(
      'https://raw.githubusercontent.com/patternfly/patternfly-org/1111111111111111111111111111111111111111/Button.md'
    );
    expect(result.docs['Alert']?.[0]?.path).toBe(
      'https://raw.githubusercontent.com/patternfly/patternfly-org/1111111111111111111111111111111111111111/Alert.md'
    );
  });

  it('should prune redundant AI helper entries and excludes empty categories from output', async () => {
    const redundantReports = [
      {
        category: 'Overview',
        record: {
          displayName: 'Overview Guide',
          description: 'Overview guide',
          pathSlug: 'overview-guide',
          section: 'components',
          category: 'react',
          source: 'github',
          path: 'https://raw.githubusercontent.com/patternfly/ai-helpers/main/docs/overview.md',
          version: 'v6'
        },
        reason: 'superseded by API collection'
      }
    ];

    const collectionWithOverview: PatternFlyMcpDocsCatalog = {
      ...sampleCollection,
      docs: {
        ...sampleCollection.docs,
        Overview: [
          redundantReports[0]!.record
        ]
      }
    };

    const { collection: result } = await recalculateManifestMetadata(collectionWithOverview, {
      redundantRecords: redundantReports
    });

    expect(result.docs['Overview']).toBeUndefined();
    expect(result.docs['Button']).toBeDefined();
    expect(result.docs['Alert']).toBeDefined();
    expect(result.meta.totalEntries).toBe(2);
    expect(result.meta.totalDocs).toBe(2);
  });

  it.each([
    {
      description: 'prunes broken URLs (HTTP 404)',
      latestHashes: undefined,
      mockReachable: (url: string) => !url.includes('Button.md'),
      expectedPaths: [
        'https://raw.githubusercontent.com/patternfly/patternfly-org/540bb0d31cb18670dd02857f80aa8b444fed9be9/Alert.md'
      ],
      expectedRemovals: ['broken upstream link (HTTP 404)']
    },
    {
      description: 'falls back to previous URL when bumped hash drifts/404s',
      latestHashes: new Map([['patternfly/patternfly-org', '1111111111111111111111111111111111111111']]),
      mockReachable: (url: string) => url.includes('540bb0d31cb18670dd02857f80aa8b444fed9be9'),
      expectedPaths: [
        'https://raw.githubusercontent.com/patternfly/patternfly-org/540bb0d31cb18670dd02857f80aa8b444fed9be9/Alert.md',
        'https://raw.githubusercontent.com/patternfly/patternfly-org/540bb0d31cb18670dd02857f80aa8b444fed9be9/Button.md'
      ],
      expectedRemovals: []
    },
    {
      description: 'updates commit hash when new URL is reachable',
      latestHashes: new Map([['patternfly/patternfly-org', '1111111111111111111111111111111111111111']]),
      mockReachable: () => true,
      expectedPaths: [
        'https://raw.githubusercontent.com/patternfly/patternfly-org/1111111111111111111111111111111111111111/Alert.md',
        'https://raw.githubusercontent.com/patternfly/patternfly-org/1111111111111111111111111111111111111111/Button.md'
      ],
      expectedRemovals: []
    }
  ])('should recalculate manifest metadata, $description', async ({ latestHashes, mockReachable, expectedPaths, expectedRemovals }) => {
    const reachabilitySpy = jest.spyOn(verifyUrlReachability, 'memo').mockImplementation(async (url: string) => mockReachable(url));

    const { collection: result, reachabilityRemovals } = await recalculateManifestMetadata(sampleCollection, {
      latestHashes,
      verifyReachability: true
    } as any);

    expect(reachabilityRemovals.map(removal => removal.reason)).toEqual(expectedRemovals);

    const paths = Object.entries(result.docs).map(([_key, categoryDocs]) => categoryDocs[0]?.path);

    expect(paths).toEqual(expect.arrayContaining(expectedPaths));

    reachabilitySpy.mockRestore();
  });
});
