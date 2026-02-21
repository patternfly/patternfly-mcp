import semver, { type SemVer } from 'semver';
import { getOptions } from './options.context';
import { type PatternFlyOptions } from './options.defaults';
import { findNearestPackageJson, matchPackageVersion, readLocalFileFunction } from './server.getResources';
import { fuzzySearch } from './server.search';
import { memo } from './server.caching';

interface PatternFlyVersionContext {
  availableSemVer: string[];
  availableVersions: string[];
  availableSchemasVersions: string[];
  enumeratedVersions: string[];
  envSemVer: string;
  envVersion: string;
  latestVersion: PatternFlyOptions['default']['latestVersion'];
  latestSchemasVersion: PatternFlyOptions['default']['latestSchemasVersion'];
  isEnvTheLatestVersion: boolean;
  isEnvTheLatestSchemasVersion: boolean;
}

/**
 * Find the closest PatternFly version used within the project context.
 *
 * @note Temporary closest version until environment audit tooling is available,
 * see `disabled_findClosestPatternFlyVersion` for the actual implementation.
 *
 * @param _contextPathOverride - Temporary placeholder for future context path override
 * @param options - Global options
 * @returns Temporary latest PF semVer (e.g., '6.0.0')
 */
const findClosestPatternFlyVersion = async (
  _contextPathOverride: string | undefined = undefined,
  options = getOptions()
): Promise<string> =>
  options.patternflyOptions.default.latestSemVer;

/**
 * Memoized version of findClosestPatternFlyVersion.
 */
findClosestPatternFlyVersion.memo = memo(findClosestPatternFlyVersion);

/**
 * Get the PatternFly version context.
 *
 * @note We may need to keep the latest version outside of context and add an environment latest version.
 *
 * @param contextPathOverride - Optional override for the context path
 * @param options - Global options
 * @returns The PatternFly version context, including the closest version, the latest version, and the available versions.
 *   - `availableSemVer`: The list of available PatternFly SemVer versions, (e.g. "4.0.0", "5.0.0", "6.0.0")
 *   - `availableVersions`: The list of available PatternFly `tag` versions, (e.g. "v4", "v5", "v6")
 *   - `availableSchemasVersions`: The list of available PatternFly `tag` schema versions, (e.g. "v6")
 *   - `enumeratedVersions`: The list of available PatternFly `tag` and `display` versions, (e.g. "v4", "v5", "v6", "current", "latest")
 *   - `envSemVer`: The "closest" or "detected" environment SemVer version detected in the project context.
 *   - `envVersion`: The "closest" or "detected" environment PatternFly `tag` version detected in the project context, (e.g. "v4", "v5", "v6")
 *   - `latestVersion`: The latest PatternFly `tag` version, (e.g. "v4", "v5", "v6")
 *   - `latestSchemasVersion`: The latest PatternFly `tag` schemas version
 *   - `isEnvTheLatestVersion`: Whether the environment version is the actual latest `default` version provided by MCP options.
 *   - `isEnvTheLatestSchemasVersion`: Whether the environment version is the actual latest schemas `default` version provided by MCP options.
 */
const getPatternFlyVersionContext = async (
  contextPathOverride: string | undefined = undefined,
  options = getOptions()
): Promise<PatternFlyVersionContext> => {
  const availableSemVer = options.patternflyOptions.availableResourceVersions;
  const availableVersions = availableSemVer.map(version => {
    const majorVersion = semver.coerce(version)?.major;

    return majorVersion ? `v${majorVersion}` : undefined;
  }).filter(Boolean) as string[] || [];

  const availableSchemasVersions = options.patternflyOptions.availableSchemasVersions;
  const enumeratedVersions = Array.from(new Set([...options.patternflyOptions.availableSearchVersions, ...availableVersions]));

  const latestVersion = options.patternflyOptions.default.latestVersion;
  const latestSchemasVersion = options.patternflyOptions.default.latestSchemasVersion;

  const envSemVer = await findClosestPatternFlyVersion.memo(contextPathOverride);
  const majorVersion = semver.coerce(envSemVer)?.major;
  const envVersion = majorVersion ? `v${majorVersion}` : latestVersion;

  return {
    availableSemVer,
    availableVersions,
    availableSchemasVersions,
    enumeratedVersions,
    envSemVer,
    envVersion,
    latestVersion,
    latestSchemasVersion,
    isEnvTheLatestVersion: envVersion === latestVersion,
    isEnvTheLatestSchemasVersion: envVersion === latestSchemasVersion
  };
};

/**
 * Memoized version of getPatternFlyVersionContext.
 */
getPatternFlyVersionContext.memo = memo(getPatternFlyVersionContext);

/**
 * Normalize the version string to a valid PatternFly `tag` display version, (e.g. "v4", "v5", "v6")
 *
 * @param version - The version string to normalize.
 * @returns The normalized version string, or `undefined` if the version is not recognized.
 */
const normalizeEnumeratedPatternFlyVersion = async (version?: string) => {
  const { envVersion, latestVersion, availableVersions } = await getPatternFlyVersionContext.memo();
  const updatedVersion = typeof version === 'string' ? version.toLowerCase().trim() : undefined;
  let refineVersion = updatedVersion;

  switch (updatedVersion) {
    case 'current':
    case 'latest':
      refineVersion = latestVersion;
      break;
    case 'detected':
      refineVersion = envVersion;
      break;
  }

  if (refineVersion && refineVersion.includes('.')) {
    const majorVersion = semver.coerce(refineVersion)?.major;
    const tagVersion = majorVersion ? `v${majorVersion}` : undefined;

    if (tagVersion && availableVersions.includes(tagVersion)) {
      return tagVersion;
    }
  }

  if (refineVersion && availableVersions.includes(refineVersion)) {
    return refineVersion;
  }

  return undefined;
};

/**
 * Memoized version of normalizeEnumeratedPatternFlyVersion.
 */
normalizeEnumeratedPatternFlyVersion.memo = memo(normalizeEnumeratedPatternFlyVersion);

/**
 * Get all available PatternFly enumerations OR filter a version string to a valid PatternFly `tag` OR `display` version,
 * (e.g. "current", "v6", etc.)
 *
 * @param version - The version string to filter.
 * @returns If version is provided returns the filtered version string array, or all available versions if the version
 *     is not recognized.
 */
const filterEnumeratedPatternFlyVersions = async (version?: string) => {
  const { enumeratedVersions } = await getPatternFlyVersionContext.memo();
  const normalizedVersion = await normalizeEnumeratedPatternFlyVersion.memo(version);

  return enumeratedVersions
    .filter(version => version.toLowerCase().startsWith(normalizedVersion || ''));
};

/**
 * Find the closest PatternFly version used within the project context.
 *
 * @note In the future the available versions of PatternFly will be determined by the available resources.
 * In the short-term we limit the available versions via `patternflyOptions.availableResourceVersions`.
 *
 * @note In the future consider adding a log.debug to the try/catch block if/when the find closest version
 * is integrated into tooling and resources.
 *
 * @note Getting the user's directory context requires additional MCP tooling. Aspects of this function will
 * be re-enabled and triggered via the new MCP tooling around auditing the PatternFly environment.
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
const disabled_findClosestPatternFlyVersion = async (
  contextPathOverride: string | undefined = undefined,
  options = getOptions()
): Promise<string> => {
  const availableVersions = options.patternflyOptions.availableResourceVersions;
  const { latestSemVer, versionWhitelist, versionStrategy } = options.patternflyOptions.default;
  const pkgPath = findNearestPackageJson(contextPathOverride || options.contextPath);
  const updatedDefaultVersion = latestSemVer;

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

export {
  findClosestPatternFlyVersion,
  filterEnumeratedPatternFlyVersions,
  disabled_findClosestPatternFlyVersion,
  getPatternFlyVersionContext,
  normalizeEnumeratedPatternFlyVersion,
  type PatternFlyVersionContext
};
