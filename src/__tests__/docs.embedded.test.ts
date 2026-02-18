import { EMBEDDED_DOCS } from '../docs.embedded';

describe('EMBEDDED_DOCS', () => {
  it('should export the expected embedded docs structure', () => {
    expect(EMBEDDED_DOCS).toMatchSnapshot('docs');
  });

  it('should contain valid high-level metadata and entry points', () => {
    const { docs, meta } = EMBEDDED_DOCS;

    expect(meta.source).toBe('patternfly-mcp-fallback');
    expect(docs).toHaveProperty('patternfly');
    expect(docs).toHaveProperty('React');

    const allDocs = Object.values(docs).flat();

    expect(allDocs.length).toBeGreaterThanOrEqual(5);
  });
});
