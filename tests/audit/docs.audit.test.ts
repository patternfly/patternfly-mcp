import { randomInt } from 'node:crypto';
import docs from '../../src/docs.json';
import { checkUrl } from './utils/checkUrl';

describe('Documentation Link Audit', () => {
  let auditSet: string[] = [];

  /**
   * Extracts and returns a prefix based on the provided URL.
   * - If the hostname is not "raw.githubusercontent.com", the hostname is returned.
   * - For "raw.githubusercontent.com" URLs, the function derives the prefix based on the URL's path components.
   *
   * @param url - The URL to extract the prefix from.
   * @returns The extracted prefix or "invalid-url" if the URL is invalid.
   */
  const getPrefix = (url: string) => {
    try {
      const updatedUrl = new URL(url);

      if (updatedUrl.hostname !== 'raw.githubusercontent.com') {
        return updatedUrl.hostname;
      }

      const parts = updatedUrl.pathname.split('/').filter(Boolean);

      if (parts.length < 3) {
        return `raw.githubusercontent.com/${parts.join('/')}`;
      }
      const [owner, repo, ref] = parts;

      return `raw.githubusercontent.com/${owner}/${repo}/${ref}`;
    } catch {
      return 'invalid-url';
    }
  };

  /**
   * Collect paths from docs.json
   */
  const allPaths: string[] = Object.values(docs.docs)
    .flatMap((arr: any) => arr)
    .map((doc: any) => doc.path)
    .filter((path: any) => typeof path === 'string' && path.startsWith('http'));

  /**
   * Group paths from docs.json
   */
  const groups: Record<string, string[]> = allPaths.reduce((acc, url) => {
    const key = getPrefix(url);

    (acc[key] ||= []).push(url);

    return acc;
  }, {} as Record<string, string[]>);

  /**
   * Shuffle an array. Updated Fisher-Yates shuffle.
   *
   * @param arr - Array to shuffle
   */
  const shuffle = <T>(arr: T[]) => {
    const updatedArr = [...arr];

    for (let index = updatedArr.length - 1; index > 0; index--) {
      const rIndex = randomInt(0, index + 1);

      // @ts-expect-error
      [updatedArr[index], updatedArr[rIndex]] = [updatedArr[rIndex], updatedArr[index]];
    }

    return updatedArr;
  };

  /**
   * Update the audit set based on the configured sampling logic.
   *
   * @param options - Options for sampling logic.
   * @param options.perGroup - Number of links to sample per group.
   * @param options.maxTotal - Maximum total number of links to include in the audit set.
   * @returns Updated audit set.
   */
  const updateAuditSet = ({ perGroup, maxTotal }: { perGroup: number, maxTotal: number }) => {
    for (const urls of Object.values(groups)) {
      const copy = [...urls];

      auditSet.push(...shuffle(copy).slice(0, perGroup));
    }

    if (maxTotal > 0 && auditSet.length > maxTotal) {
      auditSet = shuffle(auditSet).slice(0, maxTotal);
    }

    return auditSet;
  };

  // Apply Sampling From Workflow or apply defaults, 3 per group, max 50 total.
  const perGroup = Number(process.env.DOCS_AUDIT_PER_GROUP ?? 3);
  // Apply Sampling From Workflow or apply defaults, 50 total.
  const maxTotal = Number(process.env.DOCS_AUDIT_MAX_TOTAL ?? 50);
  const requestTimeoutMs = 10_000;

  updateAuditSet({ perGroup, maxTotal });

  // Increase timeout for the whole suite as it's doing network requests
  jest.setTimeout(auditSet.length * 5000 + requestTimeoutMs);

  it('should have an audit set', () => {
    expect(auditSet).toBeGreaterThan(1);
  });

  it.each(auditSet)('link should be reachable: %s', async url => {
    const result = await checkUrl(url, { requestTimeoutMs });

    expect(result.status).toBeGreaterThanOrEqual(200);
  });
});
