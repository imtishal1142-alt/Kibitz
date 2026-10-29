// Runs a Chess.com import in the background with progress, cancel and a summary.
import { syncChessCom } from '../lib/chesscom/sync';
import type { SyncProgress, SyncResult } from '../lib/chesscom/sync';
import { ChessComError } from '../lib/chesscom/client';
import { getProfile, putProfile } from '../lib/storage/repos';
import { createStore } from './store';

export interface ChessComJobState {
  running: boolean;
  username: string;
  progress?: SyncProgress;
  result?: SyncResult;
  error?: { code: string; message: string };
}

export const chesscomJob = createStore<ChessComJobState>({ running: false, username: '' });
let controller: AbortController | null = null;

export async function startChessComSync(username: string, opts: { force?: boolean; maxMonths?: number } = {}): Promise<SyncResult | null> {
  if (chesscomJob.get().running) return null;
  controller = new AbortController();
  chesscomJob.set({ running: true, username });
  try {
    const result = await syncChessCom({
      username,
      signal: controller.signal,
      force: opts.force,
      maxMonths: opts.maxMonths,
      onProgress: (progress) => chesscomJob.set((s) => ({ ...s, progress })),
    });
    // Remember when the last COMPLETE sync finished so the next one can say "up to date as of ...".
    if (result.profile && !result.cancelled && !result.stoppedEarly) {
      const p = (await getProfile(result.username)) ?? result.profile;
      await putProfile({ ...p, lastSync: result.finishedAt });
    }
    chesscomJob.set({ running: false, username, result });
    return result;
  } catch (e) {
    const code = e instanceof ChessComError ? e.code : 'unknown';
    chesscomJob.set({ running: false, username, error: { code, message: e instanceof Error ? e.message : String(e) } });
    return null;
  } finally {
    controller = null;
  }
}

export function cancelChessComSync(): void {
  controller?.abort();
}

export function clearChessComResult(): void {
  if (!chesscomJob.get().running) chesscomJob.set({ running: false, username: chesscomJob.get().username });
}
