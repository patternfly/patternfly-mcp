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
}

/**
 * Start an HTTP server with a set of routes and return a URL to access them.
 *
 * Internal utility used by setupFetchMock to create a local fixture server.
 *
 * @param options - HTTP fixture options
 * @param options.routes - Map of URL paths to route handlers
 * @param options.address - Server address to listen on (default: '127.0.0.1')
 * @returns Promise that resolves with server baseUrl and close method
 */
const startHttpFixture = (
  { routes = {}, address = '127.0.0.1' }: StartHttpFixtureOptions = {}
): Promise<{ baseUrl: string; close: () => Promise<void> }> =>
  new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = req.url || '';
      const route = routes[url];

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

    server.listen(0, address, () => {
      const addr = server.address();

      if (addr && typeof addr !== 'string') {
        const host = addr.address === '::' ? address : addr.address;
        const baseUrl = `http://${host}:${addr.port}`;

        resolve({ baseUrl, close: () => new Promise<void>(res => server.close(() => res())) });
      } else {
        // Fallback if the address isn't available as AddressInfo
        resolve({ baseUrl: `http://${address}`, close: () => new Promise<void>(res => server.close(() => res())) });
      }
    });

    server.on('error', reject);
  });

type StartHttpFixtureResult = Awaited<ReturnType<typeof startHttpFixture>>;

/**
 * Route configuration for fetch mocking
 */
export interface FetchRoute {

  /** URL pattern to match (supports wildcards with *) */
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
    address = '127.0.0.1'
  } = options;

  // Convert routes to fixture server format
  const fixtureRoutes: Record<string, { status?: number; headers?: Record<string, string>; body?: string | Buffer }> = {};

  routes.forEach((route, index) => {
    // Use index-based path for fixture server, we'll match by URL pattern in the mock
    const path = `/${index}`;

    fixtureRoutes[path] = {
      status: route.status || 200,
      headers: route.headers || { 'Content-Type': 'text/plain; charset=utf-8' },
      body: typeof route.body === 'string' || route.body instanceof Buffer
        ? route.body
        : '# Mocked Response'
    };
  });

  // Start fixture server
  const fixture = await startHttpFixture({ routes: fixtureRoutes, address });

  // Create URL pattern matcher
  const matchRoute = (url: string): FetchRoute | undefined => routes.find(route => {
    if (route.url instanceof RegExp) {
      return route.url.test(url);
    }
    // Support wildcards
    const pattern = route.url.replace(/\*/g, '.*');
    const regex = new RegExp(`^${pattern}$`);

    return regex.test(url);
  });

  // Set up fetch mock
  const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    // Check if URL should be excluded (e.g., MCP server requests)
    const shouldExclude = excludePorts.some(port => url.includes(`:${port}`));

    // Only intercept remote HTTP/HTTPS URLs that match our routes
    if (!shouldExclude && (url.startsWith('http://') || url.startsWith('https://'))) {
      const matchedRoute = matchRoute(url);

      if (matchedRoute) {
        // Find the route index to get the fixture path
        const routeIndex = routes.indexOf(matchedRoute);
        const fixturePath = `/${routeIndex}`;
        const fixtureUrl = `${fixture.baseUrl}${fixturePath}`;

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

