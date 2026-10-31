// Runs the Maia networks off the main thread. Messages in: { id, rating, url?, fens }. Messages out: { id, priors } or { id, error }.
import { movePriors, parseNet } from '../lib/engine/lc0net';
import type { Lc0Net } from '../lib/engine/lc0net';

const nets = new Map<string, Promise<Lc0Net>>();

async function gunzip(buf: ArrayBuffer): Promise<Uint8Array> {
  const head = new Uint8Array(buf, 0, 2);
  // A server that already undid the compression (Content-Encoding: gzip) hands over the plain file.
  if (head[0] !== 0x1f || head[1] !== 0x8b) return new Uint8Array(buf);
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function load(url: string): Promise<Lc0Net> {
  let p = nets.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`The Maia network could not be downloaded (HTTP ${r.status}).`);
        return r.arrayBuffer();
      })
      .then(gunzip)
      .then(parseNet);
    p.catch(() => nets.delete(url));
    nets.set(url, p);
  }
  return p;
}

self.onmessage = async (ev: MessageEvent<{ id: number; url: string; fens: string[]; temperature?: number }>) => {
  const { id, url, fens, temperature } = ev.data;
  try {
    const net = await load(url);
    (self as unknown as Worker).postMessage({ id, priors: movePriors(net, fens, temperature) });
  } catch (e) {
    (self as unknown as Worker).postMessage({ id, error: e instanceof Error ? e.message : String(e) });
  }
};
