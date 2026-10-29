// Test-only transports. `nodeStockfishFactory` runs the REAL Stockfish 19 build shipped in the
// `stockfish` npm package as a child process speaking UCI over stdio (the same engine files that
// run in the browser worker), so engine tests exercise genuine UCI traffic and genuine process
// failures. The "scripted" wrapper injects faults around any transport.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';
import type { TransportFactory, UciTransport } from '../../src/lib/engine/engine';

const require = createRequire(import.meta.url);

export function nodeStockfishFactory(flavor: 'lite-single' | 'asm' = 'lite-single'): TransportFactory {
  const enginePath: string = require('stockfish').findEngine(flavor);
  return () => {
    let lineCb: ((l: string) => void) | null = null;
    let errCb: ((e: Error) => void) | null = null;
    let closed = false;
    const child = spawn(process.execPath, [enginePath], { stdio: ['pipe', 'pipe', 'pipe'] });
    const rl = createInterface({ input: child.stdout });
    rl.on('line', (l) => {
      if (!closed) lineCb?.(l);
    });
    child.on('error', (e) => {
      if (!closed) errCb?.(e);
    });
    child.on('exit', (code) => {
      if (!closed) errCb?.(new Error(`engine process exited with code ${code}`));
    });
    child.stdin.on('error', () => undefined);
    const t: UciTransport = {
      send: (cmd) => {
        if (!closed && child.stdin.writable) child.stdin.write(`${cmd}\n`);
      },
      onLine: (cb) => (lineCb = cb),
      onError: (cb) => (errCb = cb),
      terminate: () => {
        closed = true;
        rl.close();
        child.kill('SIGKILL');
      },
    };
    return t;
  };
}

export interface ScriptHooks {
  /** Return true to swallow the command (the engine never sees it). */
  swallow?: (cmd: string) => boolean;
  /** Called for every command; may call `fail` to simulate a crash. */
  onSend?: (cmd: string, fail: (msg: string) => void) => void;
}

export function scripted(inner: TransportFactory, hooks: ScriptHooks): TransportFactory {
  return () => {
    const t = inner();
    let errCb: ((e: Error) => void) | null = null;
    return {
      send: (cmd) => {
        hooks.onSend?.(cmd, (msg) => setImmediate(() => errCb?.(new Error(msg))));
        if (hooks.swallow?.(cmd)) return;
        t.send(cmd);
      },
      onLine: (cb) => t.onLine(cb),
      onError: (cb) => {
        errCb = cb;
        t.onError(cb);
      },
      terminate: () => t.terminate(),
    };
  };
}

/** A transport that never answers anything (simulates missing/blocked engine files). */
export const silentFactory: TransportFactory = () => ({
  send: () => undefined,
  onLine: () => undefined,
  onError: () => undefined,
  terminate: () => undefined,
});
