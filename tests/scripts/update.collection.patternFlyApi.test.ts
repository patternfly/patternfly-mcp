import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { expandApiEmbeddedCollection, type ApiEmbeddedCollection } from '../../src/collection.patternFlyApi';

describe('collection.patternFlyApi', () => {
  const catalogPath = resolve(process.cwd(), 'src/collection.patternFlyApi.json');

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

    for (const record of parsed.records) {
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
    const expanded = expandApiEmbeddedCollection(parsed);

    expect(expanded.length).toBe(parsed.records.length);
    expect(expanded[0]?.path?.startsWith(parsed.base)).toBe(true);
  });
});
