// Which of your games you have taken through the guided review to the end (used by today's session).
import { kvGet, kvSet } from '../storage/repos';

const KEY = 'reviewedGames.v1';
const MAX = 2000;

export const loadReviewed = async (): Promise<string[]> => (await kvGet<string[]>(KEY)) ?? [];

export async function markReviewed(gameId: string): Promise<void> {
  const cur = await loadReviewed();
  if (cur.includes(gameId)) return;
  await kvSet(KEY, [...cur, gameId].slice(-MAX));
}
