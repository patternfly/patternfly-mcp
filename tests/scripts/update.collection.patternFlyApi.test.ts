import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { expandApiEmbeddedCollection, type ApiEmbeddedCollection } from '../../src/collection.patternFlyApi';
import { escapeCsvField, formatCsv, generateReportCsv, diffCollections, run } from '../../scripts/update.collection.patternFlyApi';

describe('collection.patternFlyApi', () => {
  const catalogPath = resolve(process.cwd(), 'src/collection.patternFlyApi.json');

  it('should export the run function for programmatic invocation', () => {
    expect(typeof run).toBe('function');
  });

  it('should have a generated collection catalog file', () => {
    expect(existsSync(catalogPath)).toBe(true);
  });

  it('should have a consistent JSON schema', () => {
    const raw = readFileSync(catalogPath, 'utf-8');
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
    const raw = readFileSync(catalogPath, 'utf-8');
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
    const raw = readFileSync(catalogPath, 'utf-8');
    const parsed: ApiEmbeddedCollection = JSON.parse(raw);
    const sampleRecords = parsed.records.slice(0, 50);
    const expanded = expandApiEmbeddedCollection({ ...parsed, records: sampleRecords });

    expect(expanded.length).toBe(sampleRecords.length);
    expect(expanded[0]?.path?.startsWith(parsed.base)).toBe(true);
  });

  describe('CSV Report Generator', () => {
    it('should correctly escape fields with commas, quotes, and newlines', () => {
      expect(escapeCsvField('normal')).toBe('normal');
      expect(escapeCsvField('with,comma')).toBe('"with,comma"');
      expect(escapeCsvField('with "quotes"')).toBe('"with ""quotes"""');
      expect(escapeCsvField('with\nnewline')).toBe('"with\nnewline"');
      expect(escapeCsvField(null)).toBe('');
      expect(escapeCsvField(undefined)).toBe('');
      expect(escapeCsvField(123)).toBe('123');
    });

    it('should format header and row lines into standard CSV', () => {
      const headers = ['col1', 'col2'];
      const rows = [
        ['val1', 'val2'],
        ['val3,with,comma', 'val4 "quoted"']
      ];

      const result = formatCsv(headers, rows);

      expect(result).toBe('col1,col2\nval1,val2\n"val3,with,comma","val4 ""quoted"""\n');
    });

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

      expect(lines[0]).toBe('status,path,name,qualityScore,contentType,reason,details');
      expect(lines.some(line => line.startsWith('ADDED,endpoint/added'))).toBe(true);
      expect(lines.some(line => line.startsWith('REMOVED,endpoint/removed') && line.includes('lacks quality'))).toBe(true);
      expect(lines.some(line => line.startsWith('MODIFIED,endpoint/modified') && line.includes('quality score'))).toBe(true);
      expect(lines.some(line => line.startsWith('UNCHANGED,endpoint/unchanged'))).toBe(true);
    });

    it('should generate a CSV report from a sample of catalog records', () => {
      const raw = readFileSync(catalogPath, 'utf-8');
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

      expect(lines[0]).toBe('status,path,name,qualityScore,contentType,reason,details');
      expect(lines.length).toBe(sampleRecords.length + 1);
      expect(lines.slice(1).every(line => line.startsWith('UNCHANGED,'))).toBe(true);
    });
  });
});
