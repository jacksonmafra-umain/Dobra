// A tiny fixture server for the browser tests: serves src/test/fixtures/*.html by name.
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));

/** Serves the test fixtures, or another folder of static pages (the repo's examples/sites). */
export async function startFixtureServer(dir: string = FIXTURES): Promise<{ url: string; close(): Promise<void> }> {
  const server = createServer(async (req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname;
    if (path === '/slow') {
      // Answers after 30 s: longer than any test waits.
      const timer = setTimeout(() => res.end('late'), 30_000);
      req.on('close', () => clearTimeout(timer));
      return;
    }
    const name = path.slice(1);
    if (!/^[\w-]+\.html$/.test(name)) {
      res.writeHead(404).end('not found');
      return;
    }
    try {
      const body = await readFile(`${dir.replace(/\/?$/, '/')}${name}`);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
