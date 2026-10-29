import { addGames, getGame } from '../storage/repos';
import { demoGame, DEMO_ID } from './demo';

/** Add the demo game to the library (once) and return its id. */
export async function ensureDemoGame(): Promise<string> {
  if (!(await getGame(DEMO_ID))) await addGames([demoGame()]);
  return DEMO_ID;
}
