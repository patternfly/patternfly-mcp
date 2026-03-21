import { distance } from 'fastest-levenshtein';
import docsJson from '../docs.json';

describe('docs.json', () => {
  it('should have a valid top-level generated timestamp (ISO date string)', () => {
    expect(docsJson.generated).toBeDefined();
    expect(typeof docsJson.generated).toBe('string');
    expect(docsJson.generated.length).toBeGreaterThan(0);

    const rawDate = docsJson.generated;
    const parsedDate = Date.parse(rawDate);

    expect(Number.isNaN(parsedDate)).toBe(false);

    // Canonical ISO 8601 UTC form from Date.prototype.toISOString()
    expect(new Date(parsedDate).toISOString()).toBe(rawDate);
  });

  it('should have metadata reflective of its content and unique links per each entry', () => {
    const linkMap = new Map<string, string[]>();
    const allLinks = new Set<string>();
    const baseHashes = new Set<string | undefined>();
    let totalDocs = 0;

    Object.entries(docsJson.docs).forEach(([key, entries]) => {
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

    expect(docsJson.meta.totalEntries).toBeDefined();
    expect(docsJson.meta.totalDocs).toBeDefined();
    expect(Object.entries(docsJson.docs).length).toBe(docsJson.meta.totalEntries);

    /**
     * Confirm we have limited hashes, avoid variation within pf versions
     * If this increases, hashes need to be realigned. Do not randomly change this value.
     * If you are updating `docs.json` with an agent confirm altering this value is acceptable
     * when you open your MR/PR. You may be asked to change your git hash to one of the
     * existing values and keep this value the same.
     * 1 (v6 org) + 1 (v6 react) + 1 (v5 org) + 1 (codemods) + 1 (ai-helpers)
     */
    expect(baseHashes.size).toBe(5);

    /**
     * Confirm total docs count matches metadata
     * Update the JSON metadata accordingly
     */
    expect(totalDocs).toBe(docsJson.meta.totalDocs);

    /**
     * Confirm unique links against metadata totals
     * Update the JSON metadata accordingly
     */
    expect(allLinks.size).toBe(linkMap.size);
    expect(allLinks.size).toBe(docsJson.meta.totalDocs);
  });
});

describe('docs.json data integrity', () => {
  const allEntries = Object.values(docsJson.docs).flat();
  const uniqueCategories = [...new Set(allEntries.map(entry => entry.category).filter(Boolean))];
  const uniqueSections = [...new Set(allEntries.map(entry => entry.section).filter(Boolean))];

  const checkSimilarity = (list: string[], type: string) => {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const str1 = list[i]!.toLowerCase();
        const str2 = list[j]!.toLowerCase();

        // Check for near-duplicates using Levenshtein distance
        const dist = distance(str1, str2);

        if (dist <= 2) {
          throw new Error(`Potential duplicate ${type} found: "${list[i]}" and "${list[j]}" (distance: ${dist})`);
        }

        // Check if one is a substring of another (e.g., "component" and "components")
        if (str1.includes(str2) || str2.includes(str1)) {
          throw new Error(`Potential overlapping ${type} found: "${list[i]}" and "${list[j]}"`);
        }
      }
    }
  };

  it('should have categories that are unique and distinct', () => {
    expect(() => checkSimilarity(uniqueCategories, 'category')).not.toThrow();
  });

  it('should have sections that are unique and distinct', () => {
    expect(() => checkSimilarity(uniqueSections, 'section')).not.toThrow();
  });
});
