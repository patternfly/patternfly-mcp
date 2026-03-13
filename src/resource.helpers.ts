import { filterPatternFly, type FilterPatternFlyFilters } from './patternFly.search';
import { normalizeEnumeratedPatternFlyVersion } from './patternFly.helpers';

/**
 * Centralized completion logic for PatternFly resources.
 *
 * @param {FilterPatternFlyFilters} filters
 */
const paramCompletion = async (filters: FilterPatternFlyFilters) => {
  const normalizedVersion = await normalizeEnumeratedPatternFlyVersion.memo(filters.version);
  const { byEntry } = await filterPatternFly.memo({ ...filters, version: normalizedVersion || filters.version });

  const names = new Set<string>();
  const categories = new Set<string>();
  const sections = new Set<string>();
  const versions = new Set<string>();
  const schemas = new Set<string>();

  for (const entry of byEntry) {
    names.add(entry.name);
    categories.add(entry.category);
    sections.add(entry.section);
    versions.add(entry.version);

    if (entry.uriSchemas !== undefined) {
      schemas.add(entry.name);
    }
  }

  return {
    names: Array.from(names).sort(),
    categories: Array.from(categories).sort(),
    schemas: Array.from(schemas).sort(),
    sections: Array.from(sections).sort(),
    versions: Array.from(versions).sort()
  };
};

export { paramCompletion };
