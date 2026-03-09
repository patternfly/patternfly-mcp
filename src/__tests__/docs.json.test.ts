import docs from '../docs.json';

describe('docs.json', () => {
  it('should have metadata reflective of its content and unique links per each entry', () => {
    const linkMap = new Map<string, string[]>();
    const allLinks = new Set<string>();
    const baseHashes = new Set<string | undefined>();
    let totalDocs = 0;

    Object.entries(docs.docs).forEach(([key, entries]) => {
      entries.forEach(entry => {
        totalDocs += 1;
        allLinks.add(entry.path);
        const path = entry.path;

        if (!linkMap.has(path)) {
          linkMap.set(path, []);
        }

        linkMap.get(path)?.push(`${key}: ${entry.displayName} (${entry.category})`);

        if (entry.path.includes('documentation:')) {
          baseHashes.add('documentation:');
        } else if (/^https:\/\/raw\.githubusercontent\.com\/patternfly\/[a-zA-Z0-9-]+\//.test(entry.path)) {
          baseHashes.add(entry.path.split(/\/patternfly\/[a-zA-Z0-9-]+\//)[1]?.split('/')[0]);
        } else {
          baseHashes.add(`new-resource-${entry.path}`);
        }
      });
    });

    const duplicates = Array.from(linkMap.entries())
      .filter(([_, occurrences]) => occurrences.length > 1);

    try {
      expect(duplicates.length).toBe(0);
    } catch {
      const message = duplicates
        .map(([path, occurrences]) => `Duplicate path: ${path}\nFound in:\n - ${occurrences.join('\n - ')}`)
        .join('\n\n');

      throw new Error(`Found ${duplicates.length} duplicate links in docs.json:\n\n${message}`);
    }

    expect(docs.meta.totalEntries).toBeDefined();
    expect(docs.meta.totalDocs).toBeDefined();
    expect(Object.entries(docs.docs).length).toBe(docs.meta.totalEntries);

    /**
     * Confirm we have limited hashes, avoid variation within pf versions
     * If this increases, hashes need to be realigned. Do not randomly change this value.
     * 1 (v6 org) + 1 (v6 react) + 1 (v5 org) + 1 (codemods) + 1 (ai-helpers)
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
    expect(allLinks.size).toBe(linkMap.size);
    expect(allLinks.size).toBe(docs.meta.totalDocs);
  });
});
