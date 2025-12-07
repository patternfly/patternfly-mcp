/**
 * Fetch Mocking Utilities for E2E Tests
 *
 * Provides high-level helpers for mocking fetch requests by routing them to a local fixture server.
 */
import http from 'node:http';
import { jest } from '@jest/globals';
import { originalFetch } from '../jest.setupTests';

type HeadersMap = Record<string, string | number | string[]>;
type RouteHandler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

interface Route {
  status?: number;
  headers?: HeadersMap;
  body?: string | Buffer | Uint8Array | RouteHandler;
}

type RoutesMap = Record<string, Route>;

interface StartHttpFixtureOptions {
  routes?: RoutesMap;
  address?: string;
  port?: number;
}

/**
 * Start an HTTP server with a set of routes and return a URL to access them.
 *
 * Internal utility used by setupFetchMock to create a local fixture server.
 *
 * @param options - HTTP fixture options
 * @param options.routes - Map of URL paths to route handlers
 * @param options.address - Server address to listen on (default: '127.0.0.1')
 * @param options.port - Server port to listen on (default: 0, which means a random port)
 * @param regexRoutes
 * @returns Promise that resolves with server baseUrl and close method
 */
const startHttpFixture = (
  { routes = {}, address = '127.0.0.1', port = 0 }: StartHttpFixtureOptions = {},
  regexRoutes: FetchRoute[] = []
): Promise<{ baseUrl: string; close: () => Promise<void>; addRoute?: (path: string, route: Route) => void }> =>
  new Promise((resolve, reject) => {
    const dynamicRoutes: Record<string, Route> = { ...routes };

    const server = http.createServer((req, res) => {
      const url = req.url || '';
      let route = dynamicRoutes[url];

      // If route not found and we have regex routes, try to match them
      if (!route && regexRoutes.length > 0) {
        const pathname = url;

        // Try to match against regex routes
        for (const regexRoute of regexRoutes) {
          if (regexRoute.url instanceof RegExp) {
            // Test regex against pathname
            if (regexRoute.url.test(pathname) || regexRoute.url.test(`http://${address}${pathname}`)) {
              // Register this route dynamically
              route = {
                status: regexRoute.status || 200,
                headers: regexRoute.headers || { 'Content-Type': 'text/plain; charset=utf-8' },
                body: typeof regexRoute.body === 'string' || regexRoute.body instanceof Buffer
                  ? regexRoute.body
                  : '# Mocked Response'
              };
              dynamicRoutes[pathname] = route;
              break;
            }
          } else if (typeof regexRoute.url === 'string' && !regexRoute.url.startsWith('/')) {
            // String pattern with wildcards
            const pattern = regexRoute.url.replace(/\*/g, '.*');
            const regex = new RegExp(`^${pattern}$`);

            if (regex.test(pathname) || regex.test(`http://${address}${pathname}`)) {
              route = {
                status: regexRoute.status || 200,
                headers: regexRoute.headers || { 'Content-Type': 'text/plain; charset=utf-8' },
                body: typeof regexRoute.body === 'string' || regexRoute.body instanceof Buffer
                  ? regexRoute.body
                  : '# Mocked Response'
              };
              dynamicRoutes[pathname] = route;
              break;
            }
          }
        }
      }

      if (!route) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');

        return res.end('Not Found');
      }

      const { status = 200, headers = {}, body } = route;

      res.statusCode = status;

      Object.entries(headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });

      if (typeof body === 'function') {
        return (body as RouteHandler)(req, res);
      }

      return res.end(body as string | Buffer | Uint8Array | undefined);
    });

    server.listen(port, address, () => {
      const addr = server.address();

      if (addr && typeof addr !== 'string') {
        const host = addr.address === '::' ? address : addr.address;
        const baseUrl = `http://${host}:${addr.port}`;

        resolve({
          baseUrl,
          close: () => new Promise<void>(res => server.close(() => res())),
          addRoute: (path: string, route: Route) => {
            dynamicRoutes[path] = route;
          }
        });
      } else {
        // Fallback if the address isn't available as AddressInfo
        resolve({
          baseUrl: `http://${address}`,
          close: () => new Promise<void>(res => server.close(() => res())),
          addRoute: (path: string, route: Route) => {
            dynamicRoutes[path] = route;
          }
        });
      }
    });

    server.on('error', reject);
  });

type StartHttpFixtureResult = Awaited<ReturnType<typeof startHttpFixture>> & {
  addRoute?: (path: string, route: Route) => void;
};

/**
 * Route configuration for fetch mocking
 */
export interface FetchRoute {

  /** URL pattern to match (RegExp, string pattern with wildcards, or direct path starting with '/') */
  url: string | RegExp;

  /** HTTP status code */
  status?: number;

  /** Response headers */
  headers?: Record<string, string>;

  /** Response body (string, Buffer, or function) */
  body?: string | Buffer | ((req: Request) => Promise<string | Buffer> | string | Buffer);
}

/**
 * Fetch mock helper that routes remote HTTP requests to a fixture server
 *
 * This helper masks the complexity of setting up fetch mocks and fixture servers.
 * It automatically intercepts remote HTTP requests and routes them to a local fixture server.
 *
 * @example
 * ```typescript
 * const mockFetch = setupFetchMock({
 *   routes: [
 *     { url: 'https://example.com/doc.md', body: '# Test Doc' },
 *     { url: /https:\/\/github\.com\/.*\.md/, body: '# GitHub Doc' }
 *   ],
 *   excludePorts: [5001] // Don't intercept MCP server requests
 * });
 *
 * // Later in afterAll:
 * await mockFetch.cleanup();
 * ```
 */
export interface FetchMockSetup {

  /** Routes to mock */
  routes?: FetchRoute[];

  /** Ports to exclude from interception (e.g., MCP server port) */
  excludePorts?: number[];

  /** Fixture server address (default: '127.0.0.1') */
  address?: string;

  /** Fixture server port (default: 0, which means a random port) */
  port?: number;
}

export interface FetchMockResult {

  /** Cleanup function to restore fetch and close fixture server */
  cleanup: () => Promise<void>;

  /** Fixture server instance */
  fixture: StartHttpFixtureResult;
}

/**
 * Set up fetch mocking with route-based configuration
 *
 * Useful when
 * - You need different responses for different URLs
 * - You need custom status codes or headers per route
 * - You need more control over routing
 *
 * @param options - Fetch mock configuration
 * @returns Cleanup function and fixture server instance
 */
export const setupFetchMock = async (options: FetchMockSetup = {}): Promise<FetchMockResult> => {
  const {
    routes = [],
    excludePorts = [],
    address = '127.0.0.1',
    port = 0
  } = options;

  // Convert routes to fixture server format
  // For regex patterns, we need to pre-register routes at expected paths
  // For direct paths, register them upfront
  const fixtureRoutes: Record<string, { status?: number; headers?: Record<string, string>; body?: string | Buffer }> = {};
  const routeMap = new Map<FetchRoute, number>(); // Map routes to their index for reference
  const regexRoutes: FetchRoute[] = []; // Track regex routes for dynamic registration

  routes.forEach((route, index) => {
    routeMap.set(route, index);

    // If url is a string starting with '/', use it directly as the fixture server path
    if (typeof route.url === 'string' && route.url.startsWith('/')) {
      const normalizedPath = route.url.startsWith('/') ? route.url : `/${route.url}`;

      fixtureRoutes[normalizedPath] = {
        status: route.status || 200,
        headers: route.headers || { 'Content-Type': 'text/plain; charset=utf-8' },
        body: typeof route.body === 'string' || route.body instanceof Buffer
          ? route.body
          : '# Mocked Response'
      };
    } else {
      // For regex/pattern routes, track them for dynamic registration
      regexRoutes.push(route);
    }
  });

  // Start fixture server with regex routes for dynamic matching
  const fixtureOptions: StartHttpFixtureOptions = { routes: fixtureRoutes, address };

  if (port) {
    fixtureOptions.port = port;
  }
  const fixture = await startHttpFixture(fixtureOptions, regexRoutes);

  // Create URL pattern matcher
  const matchRoute = (url: string): FetchRoute | undefined => {
    // Extract pathname from URL for matching
    let pathname: string;

    try {
      const urlObj = new URL(url);

      pathname = urlObj.pathname;
    } catch {
      // If URL parsing fails, try to extract pathname manually
      const match = url.match(/^https?:\/\/[^/]+(\/.*)$/);

      pathname = match && match[1] ? match[1] : url;
    }

    return routes.find(route => {
      if (route.url instanceof RegExp) {
        // Test regex against both full URL and pathname for flexibility
        return route.url.test(url) || route.url.test(pathname);
      }
      // If url is a direct path (starts with '/'), compare pathnames
      if (route.url.startsWith('/')) {
        return pathname === route.url;
      }
      // Support wildcards for pattern matching (test against full URL)
      const pattern = route.url.replace(/\*/g, '.*');
      const regex = new RegExp(`^${pattern}$`);

      return regex.test(url);
    });
  };

  // Set up fetch mock
  const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    // Check if URL should be excluded (e.g., MCP server requests)
    const shouldExclude = excludePorts.some(port => url.includes(`:${port}`));

    // Only intercept remote HTTP/HTTPS URLs that match our routes
    if (!shouldExclude && (url.startsWith('http://') || url.startsWith('https://'))) {
      const matchedRoute = matchRoute(url);

      if (matchedRoute) {
        let fixturePath: string;

        // If url is a direct path (starts with '/'), use it directly
        if (typeof matchedRoute.url === 'string' && matchedRoute.url.startsWith('/')) {
          fixturePath = matchedRoute.url;
        } else {
          // For regex/pattern matches, extract the pathname from the matched URL
          try {
            const urlObj = new URL(url);

            fixturePath = urlObj.pathname;
          } catch {
            // If URL parsing fails, fall back to index-based path
            fixturePath = `/${routes.indexOf(matchedRoute)}`;
          }

          // Register the route dynamically at the extracted path
          // This allows regex patterns to serve from the matched path
          // Note: This is important for stdio servers that run in separate processes
          // and make real HTTP requests to the fixture server
          const normalizedPath = fixturePath.startsWith('/') ? fixturePath : `/${fixturePath}`;

          if (fixture.addRoute) {
            // Check if route already exists to avoid overwriting
            if (!fixtureRoutes[normalizedPath]) {
              fixture.addRoute(normalizedPath, {
                status: matchedRoute.status || 200,
                headers: matchedRoute.headers || { 'Content-Type': 'text/plain; charset=utf-8' },
                body: typeof matchedRoute.body === 'string' || matchedRoute.body instanceof Buffer
                  ? matchedRoute.body
                  : '# Mocked Response'
              });
              // Track in fixtureRoutes to avoid duplicate registrations
              fixtureRoutes[normalizedPath] = {
                status: matchedRoute.status || 200,
                headers: matchedRoute.headers || { 'Content-Type': 'text/plain; charset=utf-8' },
                body: typeof matchedRoute.body === 'string' || matchedRoute.body instanceof Buffer
                  ? matchedRoute.body
                  : '# Mocked Response'
              };
            }
          }
        }

        // Ensure path starts with /
        const normalizedPath = fixturePath.startsWith('/') ? fixturePath : `/${fixturePath}`;
        const fixtureUrl = `${fixture.baseUrl}${normalizedPath}`;

        // Handle function body
        if (typeof matchedRoute.body === 'function') {
          const bodyResult = await matchedRoute.body(new Request(url, init));
          // Create a Response with the function result
          const responseBody = typeof bodyResult === 'string'
            ? bodyResult
            : bodyResult instanceof Buffer
              ? bodyResult
              : String(bodyResult);

          return new Response(responseBody as BodyInit, {
            status: matchedRoute.status || 200,
            headers: matchedRoute.headers || {}
          });
        }

        // Use original fetch to hit the fixture server
        return originalFetch(fixtureUrl, init);
      }
    }

    // For non-matching URLs or excluded ports, use original fetch
    return originalFetch(input as RequestInfo, init);
  });

  return {
    fixture,
    cleanup: async () => {
      fetchSpy.mockRestore();
      await fixture.close();
    }
  };
};

/**
 * Simple fetch mock that routes all remote URLs to a single fixture
 *
 * Useful when
 * - You need the same response for all external requests
 * - You want a quick mock without route configuration
 * - Testing scenarios where the response content doesn't matter
 *
 * @param body - Response body for all intercepted requests
 * @param options - Additional options
 * @param options.excludePorts - Ports to exclude from interception (e.g., MCP server port)
 * @param options.address - Fixture server address (default: '127.0.0.1')
 * @returns Cleanup function and fixture server instance
 */
export const setupSimpleFetchMock = async (
  body: string,
  options: { excludePorts?: number[]; address?: string } = {}
): Promise<FetchMockResult> => {
  const mockOptions: FetchMockSetup = {
    routes: [
      {
        url: /^https?:\/\/.*/,
        body,
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      }
    ]
  };

  if (options.excludePorts) {
    mockOptions.excludePorts = options.excludePorts;
  }

  if (options.address) {
    mockOptions.address = options.address;
  }

  return setupFetchMock(mockOptions);
};

