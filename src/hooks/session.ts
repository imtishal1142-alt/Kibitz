import { useMemo } from 'react';
import { analysedEntries } from '../lib/games/entries';
import { isPersonal } from '../lib/games/records';
import { detectWeaknesses, userMistakes } from '../lib/analysis/weaknesses';
import { lossClassOf, isSevere } from '../lib/chess/classify';
import { gameTitle } from '../lib/ui/format';
import { localDateKey, listCalendar, listReflections } from '../lib/storage/repos';
import { loadRetests, queueRetests, retestKey } from '../lib/training/retest';
import { loadReviewed } from '../lib/training/reviewed';
import { buildSession } from '../lib/training/session';
import { isDue } from '../lib/training/srs';
import { streakInfo } from '../lib/training/streak';
import { reviewSteps } from '../lib/analysis/review';
import { useAnalyses, useGames, useSrs } from './data';
import { usePrefs } from './usePrefs';
import { useQuery } from './useQuery';

/** Today's session and streak, rebuilt whenever the underlying data changes. */
export function useSessionView() {
  const [prefs] = usePrefs();
  const games = useGames();
  const analyses = useAnalyses();
  const srs = useSrs();
  const calendar = useQuery(listCalendar, ['calendar']);
  const reflections = useQuery(() => listReflections(), ['reflections']);
  const retests = useQuery(loadRetests, ['kv']);
  const reviewed = useQuery(loadReviewed, ['kv']);

  return useMemo(() => {
    const todayKey = localDateKey();
    if (!games.data || !analyses.data || !srs.data || !calendar.data || !reflections.data || !retests.data || !reviewed.data) return { loading: true as const, session: null, streak: null, todayKey };
    const now = Date.now();
    const personal = games.data.filter((g) => isPersonal(g, prefs.includeDemoInStats));
    const entries = analysedEntries(games.data, analyses.data, prefs.includeDemoInStats);
    const weak = detectWeaknesses(entries);
    const top = weak.weaknesses.find((w) => w.evidence === 'established') ?? weak.weaknesses[0];
    const mistakeItems = entries.flatMap(({ game, analysis }) => (game.userColor ? userMistakes(analysis, game.userColor).filter((m) => isSevere(lossClassOf(m))).map((m) => ({ key: retestKey(game.id, m.ply), winLoss: m.winLoss })) : []));
    const q = queueRetests(mistakeItems, retests.data, now);
    const doneIds = new Set(reviewed.data);
    const unreviewed = [...entries]
      .sort((a, b) => b.game.endTime - a.game.endTime)
      .find((e) => e.game.userColor && !doneIds.has(e.game.id) && reviewSteps(e.analysis, e.game.userColor).length > 0);
    const today = calendar.data.find((d) => d.date === todayKey);
    const reflectedToday = reflections.data.some((r) => localDateKey(new Date(r.at)) === todayKey);
    const session = buildSession({
      gamesTotal: personal.length,
      analysedGames: entries.length,
      duePuzzles: srs.data.filter((s) => isDue(s, now)).length,
      freshPuzzles: srs.data.filter((s) => s.attempts === 0).length,
      dailyGoal: prefs.dailyGoal,
      retestable: q.due.length + q.fresh.length,
      weakness: top ? { category: top.category, label: top.label } : null,
      unreviewed: unreviewed ? { id: unreviewed.game.id, title: gameTitle(unreviewed.game) } : null,
      reflectedToday,
      today,
      dateKey: todayKey,
    });
    return { loading: false as const, session, streak: streakInfo(calendar.data, todayKey), todayKey };
  }, [games.data, analyses.data, srs.data, calendar.data, reflections.data, retests.data, reviewed.data, prefs.includeDemoInStats, prefs.dailyGoal]);
}
