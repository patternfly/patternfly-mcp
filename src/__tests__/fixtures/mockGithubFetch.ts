import { GITHUB_AI_GUIDELINES_DIRECTORY_FIXTURE } from './githubAiGuidelinesDirectory';

const nativeFetch = globalThis.fetch;

/**
 * Mock fetch to intercept GitHub Contents API calls for ai-guidelines.
 * Call in beforeAll/beforeEach of tests that trigger catalog expansion.
 */
export const installGithubFetchMock = () => {
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : 'url' in input && typeof input.url === 'string'
          ? input.url
          : String(input);

    if (url.includes('api.github.com/repos/project-felt/ai-guidelines/contents/content')) {
      return new Response(JSON.stringify(GITHUB_AI_GUIDELINES_DIRECTORY_FIXTURE), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (typeof nativeFetch === 'function') {
      return nativeFetch(input as RequestInfo, init);
    }

    throw new Error(`Unhandled fetch in test: ${url}`);
  }) as typeof fetch;
};

export const restoreNativeFetch = () => {
  globalThis.fetch = nativeFetch;
};
