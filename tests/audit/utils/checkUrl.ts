/**
 * Check if a URL is reachable.
 *
 * @param url - URL to check
 * @param options - Options
 * @param options.requestTimeoutMs - Timeout for the request in milliseconds. Defaults to 10 seconds.
 * @returns {Promise<{url: string, ok: boolean, status: number, method: string}>}
 */
const checkUrl = async (url: string, { requestTimeoutMs = 10_000 }: { requestTimeoutMs?: number } = {}) => {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), requestTimeoutMs);

  try {
    // Attempt HEAD request first
    const headResponse = await fetch(url, { method: 'HEAD', signal: ac.signal });

    if (headResponse.ok) {
      return { url, ok: true, status: headResponse.status, method: 'HEAD' };
    }

    // Fallback to GET with Range header for efficiency if HEAD is rejected
    const getResponse = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
      signal: ac.signal
    });

    return { url, ok: getResponse.ok, status: getResponse.status, method: 'GET' };
  } catch {
    return { url, ok: false, method: 'FETCH_ERROR' };
  } finally {
    clearTimeout(timer);
  }
};

export { checkUrl };
