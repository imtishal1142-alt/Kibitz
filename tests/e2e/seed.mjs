// Put known records into a browser profile by restoring a backup file through the real Settings screen.
// This keeps the tests deterministic where the app would otherwise generate content from engine analysis,
// and exercises the restore path at the same time.
export const SEED_PUZZLE = {
  id: 'seed-puzzle-1',
  fen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3',
  sideToMove: 'b',
  solution: ['g7g6'],
  accepted: ['g7g6'],
  theme: 'defense',
  themes: ['defense'],
  gameId: 'seed-game',
  ply: 6,
  playedUci: 'g8f6',
  playedSan: 'Nf6',
  solutionSan: ['g6'],
  winBefore: 50,
  gap: 30,
  unique: true,
  difficulty: 1000,
  depth: 16,
  createdAt: 1_790_000_000_000,
};

export async function restoreSeed(page, url, stores, prefs = {}) {
  await page.goto(`${url}#/settings`);
  const file = { app: 'kibitz', schema: 1, exportedAt: new Date().toISOString(), prefs, stores };
  await page.locator('#set-restore').setInputFiles({ name: 'seed.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await page.getByRole('button', { name: 'Merge into my data' }).click();
  await page.getByText(/Merged \d+ new records/).waitFor();
}
