import { existsSync, readFileSync } from 'node:fs';
import { type PatternFlyMcpDocsCatalog } from '../../../src/docs.embedded';
import { DEFAULT_DOCS_FILENAME, run } from '../update.patternFlyDocs';
import { getSrcPath } from '../helpers';

const DOCS_PATH = getSrcPath(DEFAULT_DOCS_FILENAME);

describe('collection.patternFlyDocs Script & Manifest Integrity', () => {
  it('should export the run function for programmatic invocation', () => {
    expect(typeof run).toBe('function');
  });

  it('should have a generated documentation manifest file', () => {
    expect(existsSync(DOCS_PATH)).toBe(true);
  });

  it('should have a consistent JSON schema and correct metadata counts', () => {
    const raw = readFileSync(DOCS_PATH, 'utf-8');
    const catalog: PatternFlyMcpDocsCatalog = JSON.parse(raw);

    expect(catalog).toMatchObject({
      version: expect.any(String),
      generated: expect.any(String),
      meta: {
        totalEntries: expect.any(Number),
        totalDocs: expect.any(Number),
        source: expect.any(String)
      },
      docs: expect.any(Object)
    });

    const totalEntries = Object.keys(catalog.docs).length;
    const totalDocs = Object.values(catalog.docs).reduce((acc, arr) => acc + arr.length, 0);

    expect(catalog.meta.totalEntries).toBe(totalEntries);
    expect(catalog.meta.totalDocs).toBe(totalDocs);
  });

  it('should have records that are properly formatted with key properties', () => {
    const raw = readFileSync(DOCS_PATH, 'utf-8');
    const catalog: PatternFlyMcpDocsCatalog = JSON.parse(raw);
    const sample = Object.values(catalog.docs).flatMap(docs => docs).slice(0, 50);

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
