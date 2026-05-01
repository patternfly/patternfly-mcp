/**
 * Get the current Node.js major version.
 *
 * @note Do not use the semver package here. This is purposefully a light implementation
 * meant to be shared externally without the overhead of additional packaging.
 *
 * @param nodeVersion
 * @returns Node.js major version.
 */
const getNodeMajorVersion = (nodeVersion: unknown): number => {
  if (typeof nodeVersion !== 'string') {
    return 0;
  }

  const sanitizedVersion = nodeVersion?.replace?.(/^[^0-9]+/, '');
  const major = Number.parseInt(sanitizedVersion.split('.')?.[0] || '0', 10);

  return Number.isFinite(major) ? major : 0;
};

export { getNodeMajorVersion };
