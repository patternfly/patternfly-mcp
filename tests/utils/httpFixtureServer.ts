import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

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

interface StartHttpFixtureResult {
  baseUrl: string;
  close: () => Promise<void>;
}

/**
 * Start an HTTP server with a set of routes and return a URL to access them.
 *
 * @param {StartHttpFixtureOptions} [options] - HTTP fixture options.
 * @param {Object.<RoutesMap>} [options.routes={}] - Routes to be served by the HTTP server. Keys are URL paths, and values define the route's behavior (status, headers, and body).
 * @param {string} [options.address='127.0.0.1'] - Address the server should bind to. Defaults to '127.0.0.1'.
 * @returns {Promise<StartHttpFixtureResult>} Promise that resolves with an object containing the `baseUrl` of the server and a `close` method to stop the server.
 */
export const startHttpFixture = (
  { routes = {}, address = '127.0.0.1' }: StartHttpFixtureOptions = {}
): Promise<StartHttpFixtureResult> =>
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

/**
 * Load a fixture file from the __fixtures__ directory.
 *
 * @param {string} relPath - Relative path to the fixture file.
 * @returns {string} File content.
 * @throws {Error} File cannot be found or read.
 */
export const loadFixture = (relPath: string): string =>
  fs.readFileSync(path.join(process.cwd(), 'tests', '__fixtures__', 'http', relPath), 'utf-8');

