import { useMemo } from 'react';
import { analysedEntries } from '../lib/games/entries';
import { listAnalyses, listAttempts, listGames, listPuzzles, listRepertoire, listSrs } from '../lib/storage/repos';
import { useQuery } from './useQuery';
import { usePrefs } from './usePrefs';

export const useGames = () => useQuery(listGames, ['games']);
export const useAnalyses = () => useQuery(listAnalyses, ['analyses']);
export const usePuzzles = () => useQuery(listPuzzles, ['puzzles']);
export const useSrs = () => useQuery(listSrs, ['puzzleSrs']);
export const useAttempts = () => useQuery(() => listAttempts(0), ['attempts']);
export const useRepertoire = () => useQuery(listRepertoire, ['repertoire']);

/** Analysed games of the person using the app (the demo game only if they opted in). */
export function usePersonalEntries() {
  const games = useGames();
  const analyses = useAnalyses();
  const [prefs] = usePrefs();
  const entries = useMemo(() => (games.data && analyses.data ? analysedEntries(games.data, analyses.data, prefs.includeDemoInStats) : undefined), [games.data, analyses.data, prefs.includeDemoInStats]);
  return { entries, loading: games.loading || analyses.loading, games: games.data, analyses: analyses.data };
}
