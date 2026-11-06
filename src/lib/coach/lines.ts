// What the coach says. Every line is a fixed phrase chosen from a small pool; anything specific (a move, a count, a
// reason) is filled in from data the app already verified, never invented. Pure functions so they can be tested.
import type { Mood } from '../../components/CoachAvatar';

export interface CoachLine { mood: Mood; text: string }

export function pick<T>(pool: readonly T[], seed: number): T {
  return pool[Math.abs(Math.floor(seed)) % pool.length]!;
}

const GRADE_MOOD: Record<string, Mood> = {
  brilliant: 'cheer', great: 'proud', best: 'proud', excellent: 'happy', good: 'happy', book: 'idle', forced: 'idle',
  inaccuracy: 'thinking', miss: 'worried', mistake: 'worried', blunder: 'surprised',
};
const GRADE_OPEN: Record<string, readonly string[]> = {
  brilliant: ['Brilliant!', 'Wow, that is a special move.', 'Now that is creative.'],
  great: ['Great move.', 'Sharp. That was the move to find.', 'Nicely spotted.'],
  best: ['That is the best move.', 'Exactly what the engine wants.', 'Spot on.'],
  excellent: ['Excellent.', 'Very close to the best.', 'A strong choice.'],
  good: ['A good, solid move.', 'Fine. Nothing wrong with that.', 'That works.'],
  book: ['Book move.', 'A well-known theory move.', 'Straight from the opening books.'],
  forced: ['Forced.', 'The only sensible move here.', 'No choice, really.'],
  inaccuracy: ['A small slip.', 'Slightly inaccurate.', 'Not the best, but not a disaster.'],
  miss: ['A missed chance.', 'There was something better.', 'You let a good chance go.'],
  mistake: ['That is a mistake.', 'This one gives something away.', 'Careful, this loses ground.'],
  blunder: ['Ouch, that is a blunder.', 'That one hurts.', 'This is a serious error.'],
};

/** The coach's reaction to a graded move. `why` is the app's verified explanation, when there is one. */
export function gradeLine(grade: string, why?: string, seed = 0): CoachLine {
  const open = pick(GRADE_OPEN[grade] ?? ['Here is the move.'], seed);
  return { mood: GRADE_MOOD[grade] ?? 'idle', text: why ? `${open} ${why}` : open };
}

export function greeting(c: { hour: number; games: number; analysed: number; due: number; streak: number; name?: string }, seed = 0): CoachLine {
  const hello = c.hour < 5 ? 'Up late' : c.hour < 12 ? 'Good morning' : c.hour < 18 ? 'Good afternoon' : 'Good evening';
  const who = c.name ? `, ${c.name}` : '';
  if (c.games === 0) return { mood: 'happy', text: `${hello}${who}! I am Kibi, your coach. Give me some games, from Chess.com or a PGN, and I will find what to work on. Or just play a bot to start.` };
  if (c.analysed < c.games) return { mood: 'thinking', text: `${hello}${who}. I am still looking through your games: ${c.analysed} of ${c.games} are analysed. Insights get better as that number grows.` };
  if (c.due > 0) return { mood: 'proud', text: `${hello}${who}. You have ${c.due} puzzle${c.due === 1 ? '' : 's'} due for a repeat. Ten minutes on those is the best use of today.` };
  if (c.streak >= 3) return { mood: 'cheer', text: `${hello}${who}! ${c.streak} days in a row. Keep it going with today's session.` };
  return { mood: 'happy', text: pick([`${hello}${who}. Ready for today's session?`, `${hello}${who}. Your games are analysed. Let us work on the things that cost you most.`, `${hello}${who}. A short session now beats a long one next week.`], seed) };
}

export function puzzleLine(kind: 'start' | 'solved' | 'wrong' | 'revealed' | 'streak', c: { streak?: number; hint?: string } = {}, seed = 0): CoachLine {
  if (kind === 'solved') return { mood: 'cheer', text: pick(['Solved! That was the right idea.', 'Yes! You found it.', 'Correct. Good eye.'], seed) };
  if (kind === 'streak') return { mood: 'cheer', text: `${c.streak ?? 3} in a row. You are on a roll.` };
  if (kind === 'wrong') return { mood: 'thinking', text: pick(['Not that one. Look again at what is attacked and what is loose.', 'Close, but no. Check every check, capture and threat first.', 'That does not work. Try another idea.'], seed) };
  if (kind === 'revealed') return { mood: 'idle', text: 'Here is the solution. Play it through once and remember the pattern.' };
  return { mood: 'idle', text: c.hint ?? pick(['Look for checks, captures and threats before you move.', 'Take your time. There is one clear idea here.', 'Ask what your opponent left loose.'], seed) };
}

export function drillLine(kind: 'start' | 'right' | 'wrong' | 'done', c: { name?: string; times?: number } = {}, seed = 0): CoachLine {
  if (kind === 'start') return { mood: 'idle', text: `Play the book moves for ${c.name ?? 'this line'}. I will answer for your opponent.` };
  if (kind === 'right') return { mood: 'happy', text: pick(['Yes, that is the book move.', 'Right.', 'Good, you know this one.'], seed) };
  if (kind === 'wrong') return { mood: 'thinking', text: 'Not the book move. That does not mean it is bad, but this drill wants the line.' };
  return { mood: 'cheer', text: `Line complete${c.times ? `, ${c.times} time${c.times === 1 ? '' : 's'} now` : ''}. Repetition is how openings stick.` };
}

export function endgameLine(kind: 'start' | 'good' | 'bad' | 'win' | 'draw' | 'lost', c: { goal?: string } = {}, seed = 0): CoachLine {
  if (kind === 'start') return { mood: 'idle', text: `Your goal: ${c.goal ?? 'win'}. The engine defends as well as it can.` };
  if (kind === 'good') return { mood: 'happy', text: pick(['Accurate.', 'That keeps the result.', 'Good, keep going.'], seed) };
  if (kind === 'bad') return { mood: 'worried', text: pick(['That throws away part of the result.', 'Careful, that lets the defender back in.', 'That was not the move.'], seed) };
  if (kind === 'win') return { mood: 'cheer', text: 'You converted it. That is exactly how it is done.' };
  if (kind === 'draw') return { mood: 'proud', text: 'You held the draw. That is a real save.' };
  return { mood: 'sad', text: 'The result slipped. Reset the position and try again; the idea will click.' };
}

export function quizLine(correct: boolean, seed = 0): CoachLine {
  return correct ? { mood: 'happy', text: pick(['Yes, you can see it.', 'Right. Good eye.', 'Correct.'], seed) } : { mood: 'thinking', text: pick(['Not quite. Look at the pawns around it.', 'Not that one. Use the idea above as a checklist.', 'Look again.'], seed) };
}

export function emptyLine(page: string): CoachLine {
  const m: Record<string, string> = {
    games: 'No games yet. Import some or play a bot, and I will take it from there.',
    insights: 'I need analysed games before I can say anything honest about your play.',
    progress: 'Progress needs a few weeks of games. Come back after you have played and trained a bit.',
    puzzles: 'No puzzles yet. Add the library pack, or analyse your games and I will turn your mistakes into puzzles.',
    openings: 'Your repertoire is empty. Add a few lines and I will drill you on them.',
    session: 'Bring in some games and I will build today\'s session from them.',
    default: 'Nothing here yet.',
  };
  return { mood: 'thinking', text: m[page] ?? m.default! };
}

export function gameEndLine(outcome: 'win' | 'loss' | 'draw', text: string, seed = 0): CoachLine {
  if (outcome === 'win') return { mood: 'cheer', text: `${text} Well played! Review the game and I will show you which moves made the difference.` };
  if (outcome === 'draw') return { mood: 'proud', text: `${text} A draw is a fair result. Review the game and see whether you had more.` };
  return { mood: 'sad', text: `${text} ${pick(['Every loss teaches something.', 'It happens to everyone.', 'Let us find out where it turned.'], seed)} Review the game and I will point out the key moments.` };
}
