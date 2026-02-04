import semver, { type SemVer } from 'semver';
import { getOptions } from './options.context';
import {
  findNearestPackageJson,
  matchPackageVersion,
  readLocalFileFunction
} from './server.getResources';
import { fuzzySearch } from './server.search';
import { memo } from './server.caching';

/**
 * Find the closest PatternFly version used within the project context.
 *
 * @note In the future the available versions of PatternFly will be determined by the available resources.
 * In the short-term we limit the available versions via `patternflyOptions.availableResourceVersions`.
 *
 * @note In the future consider adding a log.debug to the try/catch block if/when the find closest version
 * is integrated into tooling and resources.
 *
 * Logic:
 * 1. Locates the nearest package.json.
 * 2. Scans whitelisted dependencies using fuzzy matching.
 * 3. Aggregates, filters all detected versions that exist in the documentation catalog.
 * 4. Resolves the final version using the optional configured strategy (e.g. target the highest version, target the lowest version).
 *
 * @param contextPathOverride - Optional override for the context path to search for package.json
 * @param options - Global options
 * @returns Matched PatternFly semver version (e.g., '6.0.0', '5.0.0', '4.0.0')
 */
const findClosestPatternFlyVersion = async (
  contextPathOverride: string | undefined = undefined,
  options = getOptions()
): Promise<string> => {
  const availableVersions = options.patternflyOptions.availableResourceVersions;
  const { defaultVersion, versionWhitelist, versionStrategy } = options.patternflyOptions.default;
  const pkgPath = findNearestPackageJson(contextPathOverride || options.contextPath);
  const updatedDefaultVersion = semver.coerce(defaultVersion)?.version || defaultVersion;

  if (!pkgPath) {
    return updatedDefaultVersion;
  }

  try {
    const content = await readLocalFileFunction.memo(pkgPath);
    const pkg = JSON.parse(content);
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies } as Record<string, string>;
    const depNames = Object.keys(allDeps);

    const detectedVersions = new Set<SemVer>();

    for (const pkgName of versionWhitelist) {
      // Allow for variations like -next or -alpha with fuzzySearch maxDistance
      const matches = fuzzySearch(pkgName, depNames, {
        maxDistance: 1,
        isFuzzyMatch: true
      });

      for (const match of matches) {
        const versionMatch = matchPackageVersion(allDeps[match.item], availableVersions);

        if (versionMatch) {
          detectedVersions.add(versionMatch);
        }
      }
    }

    if (detectedVersions.size === 0) {
      return updatedDefaultVersion;
    }

    if (detectedVersions.size === 1) {
      return Array.from(detectedVersions)[0]?.version as string;
    }

    const versionsArray = Array.from(detectedVersions);
    const maxVersion = versionStrategy === 'highest'
      ? semver.maxSatisfying(versionsArray, '*')
      : semver.minSatisfying(versionsArray, '*');

    return maxVersion?.version || updatedDefaultVersion;
  } catch {
    return updatedDefaultVersion;
  }
};

/**
 * Memoized version of findClosestPatternFlyVersion.
 */
findClosestPatternFlyVersion.memo = memo(findClosestPatternFlyVersion);

export { findClosestPatternFlyVersion };
