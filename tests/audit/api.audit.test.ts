import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expandApiEmbeddedCollection, type ApiEmbeddedCollection } from '../../src/collection.patternFlyApi';
import { checkUrl } from './utils/checkUrl';

describe('PatternFly API Link Audit', () => {
  const catalogPath = resolve(process.cwd(), 'src/collection.patternFlyApi.json');
  const raw = readFileSync(catalogPath, 'utf-8');
  const catalog: ApiEmbeddedCollection = JSON.parse(raw);
  const expanded = expandApiEmbeddedCollection(catalog);

  // Sample a subset across records
  const maxSample = Number(process.env.API_AUDIT_MAX_TOTAL ?? 20);
  const sampleSet = expanded
    .map(record => record.path)
    .sort(() => 0.5 - Math.random())
    .slice(0, maxSample);

  it('should have an audit set', () => {
    expect(sampleSet.length).toBeGreaterThan(0);
  });

  it.each(sampleSet)('link should be reachable: %s', async url => {
    const result = await checkUrl(url, { requestTimeoutMs: 10_000 });

    expect(result.status).toBeGreaterThanOrEqual(200);
    expect(result.status).toBeLessThanOrEqual(299);
  });
});
