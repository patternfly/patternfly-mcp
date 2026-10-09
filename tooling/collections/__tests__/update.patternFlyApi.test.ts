import { readFileSync, existsSync } from 'node:fs';
import { expandApiEmbeddedCollection, type ApiEmbeddedCollection } from '../../../src/collection.patternFlyApi';
import {
  DEFAULT_API_FILENAME,
  generateReportCsv,
  diffCollections,
  run
} from '../update.patternFlyApi';
import { getSrcPath } from '../helpers';

const COLLECTION_PATH = getSrcPath(DEFAULT_API_FILENAME);

describe('collection.patternFlyApi', () => {
  it('should export the run function for programmatic invocation', () => {
    expect(typeof run).toBe('function');
  });

  it('should have a generated collection file', () => {
    expect(existsSync(COLLECTION_PATH)).toBe(true);
  });

  it('should have a consistent JSON schema', () => {
    const raw = readFileSync(COLLECTION_PATH, 'utf-8');
    const parsed: ApiEmbeddedCollection = JSON.parse(raw);

    expect(parsed).toMatchObject({
      version: expect.any(String),
      generated: expect.any(String),
      base: expect.stringMatching(/^https?:\/\//),
      records: expect.any(Array)
    });
    expect(parsed.records.length).toBeGreaterThan(0);
  });

  it('should have records that are compressed and have key properties', () => {
    const raw = readFileSync(COLLECTION_PATH, 'utf-8');
    const parsed: ApiEmbeddedCollection = JSON.parse(raw);
    const sample = parsed.records.slice(0, 50);

    expect(parsed.records.length).toBeGreaterThan(0);
    for (const record of sample) {
      expect(typeof record.p).toBe('string'); // path
      expect(typeof record.n).toBe('string'); // display name
      expect(typeof record.d).toBe('string'); // description
      expect(typeof record.c).toBe('string'); // content type
      expect(typeof record.q).toBe('number'); // quality score

      // Ensure relative paths do not retain leading slash or base URL prefix
      expect(record.p.startsWith('/')).toBe(false);
      expect(record.p.startsWith('http')).toBe(false);
    }
  });

  it('should be able to expanded and hydrate properties without errors', () => {
    const raw = readFileSync(COLLECTION_PATH, 'utf-8');
    const parsed: ApiEmbeddedCollection = JSON.parse(raw);
    const sampleRecords = parsed.records.slice(0, 50);
    const expanded = expandApiEmbeddedCollection({ ...parsed, records: sampleRecords });

    expect(expanded.length).toBe(sampleRecords.length);
    expect(expanded[0]?.path?.startsWith(parsed.base)).toBe(true);
  });
});

describe('collection.patternFlyApi CSV Report Generator', () => {
  it('should produce a full structured CSV report for added, removed, modified, and unchanged records', () => {
    const oldRecords = [
      { p: 'endpoint/removed', n: 'Old Doc', d: 'Desc', c: 'text/html', q: 0.96 },
      { p: 'endpoint/modified', n: 'Mod Doc', d: 'Old Desc', c: 'text/html', q: 0.95 },
      { p: 'endpoint/unchanged', n: 'Unchanged Doc', d: 'Desc', c: 'text/html', q: 0.98 }
    ];

    const newRecords = [
      { p: 'endpoint/added', n: 'New Doc', d: 'Desc', c: 'text/html', q: 0.97 },
      { p: 'endpoint/modified', n: 'Mod Doc', d: 'New Desc', c: 'text/html', q: 0.99 },
      { p: 'endpoint/unchanged', n: 'Unchanged Doc', d: 'Desc', c: 'text/html', q: 0.98 }
    ];

    const crawledMap = new Map();

    crawledMap.set('endpoint/removed', {
      entry: { qualityScore: 0.8, content: 'some content' },
      metadata: { isDeferred: false, isLowQuality: true, category: 'components' }
    });
    crawledMap.set('endpoint/modified', {
      entry: { qualityScore: 0.99, content: 'some content' },
      metadata: { isDeferred: false, isLowQuality: false, category: 'components' }
    });
    crawledMap.set('endpoint/unchanged', {
      entry: { qualityScore: 0.98, content: 'some content' },
      metadata: { isDeferred: false, isLowQuality: false, category: 'components' }
    });
    crawledMap.set('endpoint/added', {
      entry: { qualityScore: 0.97, content: 'some content' },
      metadata: { isDeferred: false, isLowQuality: false, category: 'components' }
    });

    const diff = diffCollections(oldRecords, newRecords, crawledMap);
    const csv = generateReportCsv({ diff, oldRecords, newRecords, crawledMap });
    const lines = csv.trim().split('\n');

    expect(lines[0]).toBe('status,path,name,previousQualityScore,newQualityScore,contentType,reason,details');
    expect(lines.some(line => line.startsWith('ADDED,endpoint/added,New Doc,,0.97'))).toBe(true);
    expect(lines.some(line => line.startsWith('REMOVED,endpoint/removed,Old Doc,0.96,0.8') && line.includes('lacks quality'))).toBe(true);
    expect(lines.some(line => line.startsWith('MODIFIED,endpoint/modified,Mod Doc,0.95,0.99') && line.includes('quality score'))).toBe(true);
    expect(lines.some(line => line.startsWith('UNCHANGED,endpoint/unchanged,Unchanged Doc,0.98,0.98'))).toBe(true);
  });

  it('should generate a CSV report from a sample of collection records', () => {
    const raw = readFileSync(COLLECTION_PATH, 'utf-8');
    const parsed: ApiEmbeddedCollection = JSON.parse(raw);
    const sampleRecords = parsed.records.slice(0, 5);
    const crawledMap = new Map();

    for (const rec of sampleRecords) {
      crawledMap.set(rec.p, {
        entry: { qualityScore: rec.q, content: 'sample content' },
        metadata: { isDeferred: false, isLowQuality: false, category: 'components' }
      });
    }

    const diff = diffCollections(sampleRecords, sampleRecords, crawledMap);
    const csv = generateReportCsv({
      diff,
      oldRecords: sampleRecords,
      newRecords: sampleRecords,
      crawledMap
    });
    const lines = csv.trim().split('\n');

    expect(lines[0]).toBe('status,path,name,previousQualityScore,newQualityScore,contentType,reason,details');
    expect(lines.length).toBe(sampleRecords.length + 1);
    expect(lines.slice(1).every(line => line.startsWith('UNCHANGED,'))).toBe(true);
  });
});
