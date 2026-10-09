import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
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
import { DEFAULT_API_FILENAME, DEFAULT_DOCS_FILENAME } from '../update.patternFlyDocs';
import { getSrcPath } from '../helpers';

const DOCS_PATH = getSrcPath(DEFAULT_DOCS_FILENAME);
const API_PATH = getSrcPath(DEFAULT_API_FILENAME);
const RECORDS_MAINT_DOCS_PATH = resolve(process.cwd(), `records-maint/${DEFAULT_DOCS_FILENAME}`);

describe('docs.helpers CSV Report Generator', () => {
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

describe('API Deduplication Litmus Test (Regression Guard)', () => {
  it('correctly detects all 20 redundant AI-helper entries when cross-referenced with API seed', () => {
    const sourcePath = existsSync(RECORDS_MAINT_DOCS_PATH) ? RECORDS_MAINT_DOCS_PATH : DOCS_PATH;
    const rawDocs = readFileSync(sourcePath, 'utf-8');
    const rawApi = readFileSync(API_PATH, 'utf-8');
    const docs = JSON.parse(rawDocs);
    const api = JSON.parse(rawApi);

    const redundant = findApiRedundantDocs(docs, api.records);

    if (docs.meta.totalDocs >= 341) {
      expect(redundant.length).toBe(20);

      const expectedDisplayNames = [
        'Table Rules',
        'React Charts',
        'React Chatbot',
        'AI Prompt Guidance',
        'Styling Standards',
        'PatternFly React Development Rules',
        'React Guidelines',
        'React Setup',
        'Development Environment',
        'Quick Start',
        'External Links',
        'React Troubleshooting',
        'Component Architecture',
        'Quick Deployment Guide for Prototypes',
        'Component Groups',
        'Data Display',
        'Layout Components'
      ];
      const expectedPathSlugs = [
        'ai-helpers-readme',
        'ai-helpers-contributing',
        'ai-helpers-contributing-skills'
      ];

      const redundantDisplayNames = new Set(redundant.map(report => report.record.displayName));
      const redundantPathSlugs = new Set(redundant.map(report => report.record.pathSlug));

      for (const name of expectedDisplayNames) {
        expect(redundantDisplayNames.has(name)).toBe(true);
      }
      for (const slug of expectedPathSlugs) {
        expect(redundantPathSlugs.has(slug)).toBe(true);
      }
    } else {
      expect(redundant.length).toBe(0);
    }
  });

  it('preserves the 6 core root AIHelpers guides and ecosystem repositories without false positives', () => {
    const rawDocs = readFileSync(DOCS_PATH, 'utf-8');
    const rawApi = readFileSync(API_PATH, 'utf-8');
    const docs = JSON.parse(rawDocs);
    const api = JSON.parse(rawApi);

    const redundant = findApiRedundantDocs(docs, api.records);
    const redundantPaths = new Set(redundant.map(report => report.record.path));

    const rootAiHelpers = docs.docs['AIHelpers'] || [];

    for (const item of rootAiHelpers) {
      if (item.pathSlug.startsWith('uxd-ai-helpers-')) {
        expect(redundantPaths.has(item.path)).toBe(false);
      }
    }

    for (const entries of Object.values(docs.docs as Record<string, any[]>)) {
      for (const item of entries) {
        if (
          item.path.includes('/patternfly-cli/') ||
          item.path.includes('/patternfly-elements/') ||
          item.path.includes('/patternfly-mcp/') ||
          item.path.includes('/pf-codemods/')
        ) {
          expect(redundantPaths.has(item.path)).toBe(false);
        }
      }
    }
  });
});

describe('docs.helpers Manifest Recalculation & Diffing', () => {
  it('should recalculate manifest metadata totalEntries and totalDocs accurately', () => {
    const sampleCatalog: PatternFlyMcpDocsCatalog = {
      version: '1',
      generated: '2026-01-01T00:00:00.000Z',
      meta: {
        totalEntries: 2,
        totalDocs: 3,
        source: 'patternfly-mcp'
      },
      docs: {
        Button: [
          {
            displayName: 'Button 1',
            description: 'Desc 1',
            pathSlug: 'button-1',
            section: 'components',
            category: 'react',
            source: 'github',
            path: 'https://raw.githubusercontent.com/patternfly/patternfly-react/1111111111111111111111111111111111111111/Button.md',
            version: 'v6'
          },
          {
            displayName: 'Button 2',
            description: 'Desc 2',
            pathSlug: 'button-2',
            section: 'components',
            category: 'react',
            source: 'github',
            path: 'https://raw.githubusercontent.com/patternfly/patternfly-react/1111111111111111111111111111111111111111/Button2.md',
            version: 'v6'
          }
        ],
        Alert: [
          {
            displayName: 'Alert 1',
            description: 'Desc alert',
            pathSlug: 'alert-1',
            section: 'components',
            category: 'react',
            source: 'github',
            path: 'https://raw.githubusercontent.com/patternfly/patternfly-org/2222222222222222222222222222222222222222/Alert.md',
            version: 'v6'
          }
        ]
      }
    };

    const latestHashes = new Map([
      ['patternfly/patternfly-react', '3333333333333333333333333333333333333333']
    ]);

    const updated = recalculateManifestMetadata(sampleCatalog, { latestHashes });

    expect(updated.meta.totalEntries).toBe(2);
    expect(updated.meta.totalDocs).toBe(3);
    expect(updated.docs.Button?.[0]?.path).toContain('3333333333333333333333333333333333333333');
    expect(updated.docs.Alert?.[0]?.path).toContain('2222222222222222222222222222222222222222');
  });

  it('should diff manifests and categorize added, removed, modified, and unchanged entries', () => {
    const oldCatalog: PatternFlyMcpDocsCatalog = {
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

    const newCatalog: PatternFlyMcpDocsCatalog = {
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

    const diff = diffDocsManifests(oldCatalog, newCatalog);

    expect(diff.modified.length).toBe(1);
    expect(diff.modified[0]?.record.displayName).toBe('Doc A');
    expect(diff.removed.length).toBe(1);
    expect(diff.removed[0]?.record.displayName).toBe('Doc B');
    expect(diff.added.length).toBe(1);
    expect(diff.added[0]?.record.displayName).toBe('Doc C');
  });

  it('should maintain declarative pinned historical hashes and guideline aliases', () => {
    expect(PINNED_HISTORICAL_REFS instanceof Set).toBe(true);
    expect(PINNED_HISTORICAL_REFS.has('ec02b437ec72b6e4cc4e28524516288f4acf9fdf')).toBe(true);
    expect(PINNED_HISTORICAL_REFS.has('e8cca17430a8ccb062ed1878073165417a081b34')).toBe(true);

    expect(AI_GUIDELINE_ALIASES['table-rules']).toBe('table');
    expect(AI_GUIDELINE_ALIASES['layout-components']).toBe('layout');
    expect(AI_GUIDELINE_ALIASES['development-rules']).toBe('overview');
  });

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
      description: 'table rules alias matching table endpoint',
      doc: {
        displayName: 'Table Rules',
        pathSlug: 'table-rules',
        path: 'https://raw.githubusercontent.com/rh-uxd/ai-helpers/main/docs/components/data-display/table.md'
      },
      expected: 'v6/AI/development-guidelines_table/text'
    },
    {
      description: 'charts token matching charts endpoint',
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
});
