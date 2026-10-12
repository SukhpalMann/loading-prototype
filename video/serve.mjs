// Serves the production build on a local port, for the recorder.
//
//   npm run build
//   node video/serve.mjs .output 4214
//
// The build targets Cloudflare, so `vite preview` does not serve it. This does what Cloudflare
// does: static assets first, then the worker's fetch handler.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(process.argv[2]);
const port = Number(process.argv[3] || 4181);
const worker = (await import(path.join(root, "server/index.mjs"))).default;
const pub = path.join(root, "public");
const types = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain",
};
const assetFetch = async (req) => {
  const u = new URL(req.url);
  const f = path.join(pub, decodeURIComponent(u.pathname));
  if (f.startsWith(pub + path.sep) && fs.existsSync(f) && fs.statSync(f).isFile())
    return new Response(fs.readFileSync(f), {
      headers: { "content-type": types[path.extname(f)] || "application/octet-stream" },
    });
  return new Response("Not found", { status: 404 });
};
http
  .createServer(async (rq, rs) => {
    try {
      const req = new Request(`http://${rq.headers.host}${rq.url}`, {
        method: rq.method,
        headers: rq.headers,
      });
      let res = await assetFetch(req);
      if (res.status === 404)
        res = await worker.fetch(
          req,
          { ASSETS: { fetch: assetFetch } },
          { waitUntil() {}, passThroughOnException() {} },
        );
      rs.writeHead(res.status, Object.fromEntries(res.headers));
      rs.end(Buffer.from(await res.arrayBuffer()));
    } catch (e) {
      console.error("server error", e);
      rs.writeHead(500);
      rs.end(String(e));
    }
  })
  .listen(port, "127.0.0.1", () => console.log("listening", port));
