import docs from '../docs.json';

describe('docs.json', () => {
  it('should have metadata reflective of its content and unique links per each entry', () => {
    const allLinks = new Set<string>();
    const baseHashes = new Set<string | undefined>();
    const flatDocs = Object.values(docs.docs).flat();
    let totalDocs = 0;

    flatDocs.forEach(entry => {
      totalDocs += 1;
      allLinks.add(entry.path);

      if (entry.path.includes('documentation:')) {
        baseHashes.add('documentation:');
      } else if (/^https:\/\/raw\.githubusercontent\.com\/patternfly\/p[a-zA-Z0-9-]+\//.test(entry.path)) {
        baseHashes.add(entry.path.split(/\/patternfly\/p[a-zA-Z0-9-]+\//)[1]?.split('/')[0]);
      } else {
        baseHashes.add(`new-resource-${entry.path}`);
      }
    });

    expect(docs.meta.totalEntries).toBeDefined();
    expect(docs.meta.totalDocs).toBeDefined();
    expect(Object.entries(docs.docs).length).toBe(docs.meta.totalEntries);

    /**
     * Confirm we have limited hashes, avoid variation within pf versions
     * If this increases, hashes need to be realigned. Do not randomly change this value.
     * 1 (v6 org) + 1 (v6 react) + 1 (v5 org) + 1 (local)
     */
    expect(baseHashes.size).toBe(5);

    /**
     * Confirm total docs count matches metadata
     * Update the JSON metadata accordingly
     */
    expect(totalDocs).toBe(docs.meta.totalDocs);

    /**
     * Confirm unique links against metadata totals
     * Update the JSON metadata accordingly
     */
    expect(allLinks.size).toBe(flatDocs.length);
    expect(allLinks.size).toBe(docs.meta.totalDocs);
  });
});
