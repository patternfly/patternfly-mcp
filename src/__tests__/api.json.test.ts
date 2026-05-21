import apiJson from '../api.json';

describe('api.json', () => {
  it('should have a valid top-level generated timestamp (ISO date string)', () => {
    expect(apiJson.generated).toBeDefined();
    expect(typeof apiJson.generated).toBe('string');
    expect(apiJson.generated.length).toBeGreaterThan(0);

    const rawDate = apiJson.generated;
    const parsedDate = Date.parse(rawDate);

    expect(Number.isNaN(parsedDate)).toBe(false);

    // Canonical ISO 8601 UTC form from Date.prototype.toISOString()
    expect(new Date(parsedDate).toISOString()).toBe(rawDate);
  });

  it('should have a valid meta structure', () => {
    expect(apiJson.meta).toBeDefined();
    expect(apiJson.meta.totalEntries).toBeDefined();
    expect(apiJson.meta.totalDocs).toBeDefined();
    expect(apiJson.meta.source).toBe('patternfly-mcp-api');
    expect(apiJson.meta.lastBuildRun).toBeDefined();
  });

  it('should have a docs object', () => {
    expect(apiJson.docs).toBeDefined();
    expect(typeof apiJson.docs).toBe('object');
  });
});
