import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Banner, ConfirmDialog, Empty, Field, PageHead, Progress } from '../components/ui';
import { Icon } from '../components/Icon';
import { validateUsername } from '../lib/chesscom/client';
import { deleteGames, listProfiles } from '../lib/storage/repos';
import { formatDate, formatDateTime } from '../lib/ui/format';
import { useGames } from '../hooks/data';
import { useQuery } from '../hooks/useQuery';
import { usePrefs } from '../hooks/usePrefs';
import { cancelChessComSync, chesscomJob, clearChessComResult, startChessComSync } from '../services/chesscomJob';
import { useStore } from '../services/store';
import { toast } from '../services/toast';
import type { ChessComProfile, GameRecord } from '../lib/types';

const MODE_LABEL: Record<string, string> = { chess_rapid: 'Rapid', chess_blitz: 'Blitz', chess_bullet: 'Bullet', chess_daily: 'Daily' };
const CLASS_OF: Record<string, GameRecord['timeClass']> = { chess_rapid: 'rapid', chess_blitz: 'blitz', chess_bullet: 'bullet', chess_daily: 'daily' };

const ERROR_TEXT: Record<string, string> = {
  'invalid-username': 'That is not a valid Chess.com username.',
  'not-found': 'Chess.com has no player with that username. Check the spelling.',
  'rate-limited': 'Chess.com asked Kibitz to slow down and it kept refusing. Whatever was downloaded is saved: try again in a few minutes.',
  network: 'Kibitz could not reach api.chess.com. Check your connection, and whether a browser extension, VPN or network filter blocks it.',
  server: 'Chess.com returned a server error. Whatever was downloaded is saved; try again later.',
  'bad-response': 'Chess.com sent a response Kibitz could not understand.',
  cancelled: 'The import was cancelled.',
};

function Trend({ points, label }: { points: { t: number; r: number }[]; label: string }) {
  if (points.length < 5) return null;
  const W = 300;
  const H = 70;
  const ts = points.map((p) => p.t);
  const rs = points.map((p) => p.r);
  const t0 = Math.min(...ts);
  const t1 = Math.max(...ts);
  const lo = Math.min(...rs);
  const hi = Math.max(...rs);
  const x = (t: number) => (t1 === t0 ? W / 2 : ((t - t0) / (t1 - t0)) * W);
  const y = (r: number) => (hi === lo ? H / 2 : H - 6 - ((r - lo) / (hi - lo)) * (H - 12));
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.r).toFixed(1)}`).join(' ');
  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: ratings after each imported game, from ${lo} to ${hi}`} style={{ width: '100%', height: 70 }}>
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="small muted">
        {label}: {lo} to {hi} over {points.length} imported games
      </figcaption>
    </figure>
  );
}

function ProfileCard({ p, games }: { p: ChessComProfile; games: GameRecord[] }) {
  const trends = useMemo(() => {
    const out: { key: string; points: { t: number; r: number }[] }[] = [];
    for (const key of Object.keys(CLASS_OF)) {
      const pts = games
        .filter((g) => g.source === 'chesscom' && g.userName?.toLowerCase() === p.username && g.timeClass === CLASS_OF[key] && g.userRating)
        .sort((a, b) => a.endTime - b.endTime)
        .map((g) => ({ t: g.endTime, r: g.userRating! }));
      if (pts.length >= 5) out.push({ key, points: pts });
    }
    return out;
  }, [games, p.username]);
  const modes = Object.entries(p.stats);
  return (
    <section className="sheet pad stack" aria-label={`Chess.com profile of ${p.profile.username}`}>
      <div className="row-nowrap" style={{ alignItems: 'flex-start' }}>
        {p.profile.avatar ? <img className="avatar" src={p.profile.avatar} alt={`${p.profile.username}'s Chess.com avatar`} width={64} height={64} referrerPolicy="no-referrer" loading="lazy" style={{ borderRadius: 12, flex: 'none' }} /> : null}
        <div className="grow">
          <h2 style={{ margin: 0 }}>
            {p.profile.title ? <span className="chip chip-accent" style={{ marginRight: 8 }}>{p.profile.title}</span> : null}
            {p.profile.username}
          </h2>
          <div className="muted small">
            {[p.profile.name, p.profile.country?.toUpperCase(), p.profile.joined ? `Joined ${formatDate(p.profile.joined)}` : null, p.profile.followers !== undefined ? `${p.profile.followers} followers` : null, p.profile.status && p.profile.status !== 'basic' ? p.profile.status : null].filter(Boolean).join(' · ')}
          </div>
          {p.profile.url ? (
            <a className="small" href={p.profile.url} target="_blank" rel="noreferrer noopener">
              Open on Chess.com
            </a>
          ) : null}
        </div>
      </div>

      {modes.length ? (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Official Chess.com ratings by time class</caption>
            <thead>
              <tr>
                <th scope="col">Time class</th>
                <th scope="col" className="right">Current</th>
                <th scope="col" className="right">Best</th>
                <th scope="col" className="right">Record (W/L/D)</th>
              </tr>
            </thead>
            <tbody>
              {modes.map(([k, v]) => (
                <tr key={k}>
                  <th scope="row">{MODE_LABEL[k] ?? k}</th>
                  <td className="right num">{v.last ? v.last.rating : '—'}</td>
                  <td className="right num">{v.best ? v.best.rating : '—'}</td>
                  <td className="right num">{v.record ? `${v.record.win}/${v.record.loss}/${v.record.draw}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">This account has no rated games in the standard time classes.</p>
      )}
      {trends.length ? (
        <div>
          <h3 style={{ fontSize: '1rem', marginBottom: 8 }}>Rating after each game you imported</h3>
          <div className="grid-2">
            {trends.map((t) => (
              <Trend key={t.key} points={t.points} label={MODE_LABEL[t.key] ?? t.key} />
            ))}
          </div>
          <p className="hint">Built from the ratings printed in your imported games. It is not an official rating history: Chess.com&apos;s public API does not provide one.</p>
        </div>
      ) : null}
      <p className="hint" style={{ margin: 0 }}>
        Data fetched {formatDateTime(p.fetchedAt)} from <code>{p.source}</code> (official Chess.com Published Data API).{p.lastSync ? ` Last complete sync: ${formatDateTime(p.lastSync)}.` : ''}
      </p>
    </section>
  );
}

export default function ChessCom() {
  const [prefs, setPrefs] = usePrefs();
  const [name, setName] = useState(prefs.chesscomUser);
  const [months, setMonths] = useState('0');
  const [force, setForce] = useState(false);
  const [err, setErr] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const job = useStore(chesscomJob);
  const profiles = useQuery(listProfiles, ['profiles']);
  const games = useGames();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = validateUsername(name);
    if (!v.ok) {
      setErr(v.error);
      return;
    }
    setErr('');
    setPrefs({ chesscomUser: v.username });
    clearChessComResult();
    void startChessComSync(v.username, { force, maxMonths: Number(months) || 0 });
  };

  const p = job.progress;
  const r = job.result;
  const total = p?.archiveTotal ?? 0;
  const skippedTotal = r ? Object.values(r.skipped).reduce((a, b) => a + (b ?? 0), 0) : 0;
  const mine = [...(profiles.data ?? [])].sort((a, b) => b.fetchedAt - a.fetchedAt);
  const imported = (games.data ?? []).filter((g) => g.source === 'chesscom');

  return (
    <div className="stack page-narrow">
      <PageHead title="Chess.com" sub="Import your public games with Chess.com's official data service." />
      <section className="sheet pad stack" aria-label="Import">
        <form onSubmit={submit} className="stack-sm">
          <Field label="Chess.com username" htmlFor="cc-user" hint="Public data only. Kibitz never asks for your password, and you do not need to sign in.">
            <input id="cc-user" className="input" value={name} onChange={(e) => (setName(e.target.value), setErr(''))} autoComplete="username" autoCapitalize="off" spellCheck={false} aria-invalid={!!err} disabled={job.running} />
          </Field>
          {err ? (
            <p role="alert" className="small" style={{ color: 'var(--c-blunder)', margin: 0 }}>
              {err}
            </p>
          ) : null}
          <details>
            <summary className="small" style={{ cursor: 'pointer' }}>
              Options
            </summary>
            <div className="stack-sm" style={{ marginTop: 10 }}>
              <Field label="How far back" htmlFor="cc-months">
                <select id="cc-months" className="select" value={months} onChange={(e) => setMonths(e.target.value)} disabled={job.running}>
                  <option value="0">Everything (newest months first)</option>
                  <option value="1">Last month</option>
                  <option value="3">Last 3 months</option>
                  <option value="6">Last 6 months</option>
                  <option value="12">Last 12 months</option>
                </select>
              </Field>
              <label className="row-nowrap">
                <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} disabled={job.running} />
                <span>Download every month again, even months already complete</span>
              </label>
            </div>
          </details>
          <div className="row">
            {job.running ? (
              <button key="cancel" className="btn" type="button" onClick={cancelChessComSync}>
                <Icon name="stop" /> Cancel import
              </button>
            ) : (
              <button key="start" className="btn btn-primary" type="submit">
                <Icon name="cloud" /> {mine.some((x) => x.username === name.trim().toLowerCase()) ? 'Sync new games' : 'Import games'}
              </button>
            )}
          </div>
        </form>

        {job.running ? (
          <div className="stack-sm" role="status" aria-live="polite">
            <Progress value={total ? Math.min(1, (p?.archiveIndex ?? 0) / total) : 0} label="Import progress" />
            <div className="small">
              {!p || p.phase === 'profile' ? 'Fetching the profile…' : p.phase === 'archives' ? 'Looking up your monthly archives…' : `Month ${Math.min(p.archiveIndex + 1, total)} of ${total}${p.month ? ` (${p.month})` : ''}: ${p.gamesSeen} games seen, ${p.added} new, ${p.duplicates} already saved${p.skippedCached ? `, ${p.skippedCached} complete months skipped` : ''}`}
            </div>
            <div className="hint">Requests are sent one at a time with pauses, as Chess.com asks. Whatever is downloaded is saved immediately, so cancelling loses nothing.</div>
          </div>
        ) : null}

        {job.error ? (
          <Banner kind="bad" role="alert">
            {ERROR_TEXT[job.error.code] ?? job.error.message}
            {job.error.code === 'network' ? ' If you can open https://api.chess.com/pub/player/hikaru in a new tab but the import still fails, your browser is blocking cross-site requests from this page: try another browser or a private window without extensions.' : ''}
          </Banner>
        ) : null}

        {r && !job.running ? (
          <Banner kind={r.cancelled || r.stoppedEarly || r.errors.length ? 'warn' : 'ok'} role="status">
            <div className="stack-sm">
              <strong>{r.cancelled ? 'Import cancelled.' : r.stoppedEarly ? 'Import stopped early.' : 'Import finished.'}</strong>
              <span>
                {r.added} new game{r.added === 1 ? '' : 's'} added, {r.duplicates} already saved, {r.archivesFetched} of {r.archivesTotal} months downloaded
                {r.archivesSkippedCached ? ` (${r.archivesSkippedCached} complete months not downloaded again)` : ''}.
                {skippedTotal ? ` ${skippedTotal} game${skippedTotal === 1 ? '' : 's'} skipped (${Object.entries(r.skipped).map(([k, v]) => `${v} ${k === 'variant' ? 'chess variants' : k === 'no-pgn' ? 'without a PGN' : k === 'bad-pgn' ? 'with unreadable moves' : k}`).join(', ')}).` : ''}
              </span>
              {r.stoppedEarly ? <span>{ERROR_TEXT[r.stoppedEarly] ?? ''} Run the import again to carry on from where it stopped.</span> : null}
              {r.errors.length ? <span className="small">Problems: {r.errors.slice(0, 3).join('; ')}{r.errors.length > 3 ? ` and ${r.errors.length - 3} more` : ''}</span> : null}
              {r.added > 0 ? (
                <span>
                  <Link className="btn btn-sm btn-primary" to="/library">
                    Open Games and analyse them
                  </Link>
                </span>
              ) : null}
            </div>
          </Banner>
        ) : null}
      </section>

      {mine.map((pr) => (
        <div key={pr.username} className="stack-sm">
          <ProfileCard p={pr} games={games.data ?? []} />
          <div className="row">
            <Link className="btn btn-sm" to="/library">
              {imported.filter((g) => g.userName?.toLowerCase() === pr.username).length} imported games
            </Link>
            <button className="btn btn-sm btn-danger" type="button" onClick={() => setConfirmRemove(pr.username)}>
              <Icon name="trash" /> Remove imported games
            </button>
          </div>
        </div>
      ))}
      {!profiles.loading && mine.length === 0 && !job.running ? <Empty title="No Chess.com account connected yet">Enter a username above. Importing a profile you do not own works too: the data is public.</Empty> : null}

      <section className="sheet pad stack-sm" aria-label="What this connection can and cannot do">
        <h2 style={{ fontSize: '1.05rem' }}>What this import can and cannot do</h2>
        <ul className="stack-sm" style={{ margin: 0, paddingLeft: 18 }}>
          <li>It uses only Chess.com&apos;s official Published Data API: public profile, public stats and public monthly game archives. No scraping, no password, no private data.</li>
          <li>Your browser asks Chess.com directly. Nothing goes through a Kibitz server, because there is none. The only other request is your avatar image, loaded from Chess.com&apos;s image server.</li>
          <li>The API has <strong>no rating-history endpoint</strong>. Kibitz shows the current and best ratings Chess.com reports, and can only chart the ratings printed in games you have imported.</li>
          <li>Finished months are saved and never downloaded again, so later syncs are quick. The current month is checked each time. Live and daily games still in progress are not included.</li>
          <li>Games of other chess variants (such as Chess960 or Crazyhouse) are skipped because Kibitz analyses standard chess only.</li>
          <li>Chess.com&apos;s own &quot;accuracy&quot; and rating figures are shown as theirs and are never mixed with Kibitz&apos;s estimates.</li>
          <li>Kibitz was developed without access to the live Chess.com service (it was tested against recorded API-shaped responses), so the first real import is the first live check: if something fails, the message above says what.</li>
        </ul>
      </section>

      <ConfirmDialog
        open={!!confirmRemove}
        title={`Remove imported games for ${confirmRemove ?? ''}?`}
        confirmLabel="Remove games"
        danger
        body={<p>Deletes their imported games, analysis and puzzles from this device. Your Chess.com account is not affected, and you can import them again.</p>}
        onCancel={() => setConfirmRemove(null)}
        onConfirm={() => {
          const who = confirmRemove;
          setConfirmRemove(null);
          const ids = imported.filter((g) => g.userName?.toLowerCase() === who).map((g) => g.id);
          void deleteGames(ids).then(() => toast.success(`Removed ${ids.length} games.`));
        }}
      />
    </div>
  );
}
