// `dobra report`: serves the built Foldable Check page and a local site-check endpoint, so a
// website (localhost included) can be checked from the report without a hosted service.
import { readFile, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, resolve, sep } from 'node:path';
import type { CheckResult, Health } from './server';

export interface LocalHandler {
  health(): Health;
  check(body: unknown, clientIp: string): Promise<CheckResult>;
}

export interface LocalServer {
  url: string;
  close(): Promise<void>;
  /** Settles when the server stops. */
  closed: Promise<void>;
}

const MAX_BODY = 64 * 1024;
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

const MISSING = `<!doctype html><meta charset="utf-8"><title>Foldable Check</title>
<p>The report page is not built yet. Run <code>npm run build:report</code>, then restart
<code>npm run dobra -- report</code>. The check endpoint at <code>/api/check</code> already works.</p>`;

const json = (res: ServerResponse, status: number, body: unknown) =>
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify(body));

function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((done, fail) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) done(null);
      else chunks.push(c);
    });
    req.on('end', () => done(Buffer.concat(chunks).toString('utf8')));
    req.on('error', fail);
  });
}

/** The file for a request path, or null when it would leave the folder or does not exist. */
async function fileFor(dir: string, pathname: string): Promise<string | null> {
  const root = resolve(dir);
  const rel = decodeURIComponent(pathname).replace(/^\/(report\/)?/, '') || 'index.html';
  const file = resolve(root, rel);
  if (file !== root && !file.startsWith(root + sep)) return null;
  try {
    const s = await stat(file);
    return s.isDirectory() ? join(file, 'index.html') : file;
  } catch {
    return null;
  }
}

export async function startLocalServer(opts: { port: number; host: string; dir: string; handler: LocalHandler }): Promise<LocalServer> {
  const server = createServer(async (req, res) => {
    try {
      const { pathname } = new URL(req.url ?? '/', 'http://local');
      if (pathname === '/api/health') return json(res, 200, opts.handler.health());
      if (pathname === '/api/check') {
        if (req.method !== 'POST') return json(res, 405, { error: 'Use POST.' });
        const raw = await readBody(req);
        if (raw === null) return json(res, 413, { error: 'The request body is too large.' });
        let body: unknown;
        try {
          body = JSON.parse(raw);
        } catch {
          return json(res, 400, { error: 'The request body is not JSON.' });
        }
        const result = await opts.handler.check(body, req.socket.remoteAddress ?? '');
        return result.ok ? json(res, 200, result.report) : json(res, result.status, { error: result.error });
      }
      const file = await fileFor(opts.dir, pathname);
      if (file) {
        try {
          return res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(await readFile(file));
        } catch {
          // Falls through: a folder without index.html is treated as not built.
        }
      }
      const isPage = pathname === '/' || pathname === '/report/' || pathname === '/report';
      if (isPage) return res.writeHead(200, { 'content-type': TYPES['.html'] }).end(MISSING);
      res.writeHead(404).end('not found');
    } catch (e) {
      json(res, 500, { error: e instanceof Error ? e.message.split('\n')[0] : String(e) });
    }
  });
  const closed = new Promise<void>((done) => server.on('close', () => done()));
  await new Promise<void>((done, fail) => {
    server.once('error', fail);
    server.listen(opts.port, opts.host, () => done());
  });
  const { port } = server.address() as AddressInfo;
  const host = opts.host.includes(':') ? `[${opts.host}]` : opts.host;
  return {
    url: `http://${host}:${port}/`,
    close: () =>
      new Promise((done) => {
        server.closeAllConnections();
        server.close(() => done());
      }),
    closed,
  };
}
