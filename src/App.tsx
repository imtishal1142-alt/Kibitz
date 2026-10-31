import { Suspense, useEffect, useState } from 'react';
import { HashRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Icon } from './components/Icon';
import type { IconName } from './components/Icon';
import { JobsBar } from './components/JobsBar';
import { Toasts } from './components/Toasts';
import { Dialog, Spinner } from './components/ui';
import { usePrefs } from './hooks/usePrefs';
import { lazyRetry as lazy } from './lib/lazyRetry';
import { Onboarding } from './pages/Onboarding';

const Home = lazy(() => import('./pages/Home'));
const Play = lazy(() => import('./pages/Play'));
const Match = lazy(() => import('./pages/Match'));
const Library = lazy(() => import('./pages/Library'));
const Analysis = lazy(() => import('./pages/Analysis'));
const ChessCom = lazy(() => import('./pages/ChessCom'));
const Insights = lazy(() => import('./pages/Insights'));
const Session = lazy(() => import('./pages/Session'));
const Progress = lazy(() => import('./pages/Progress'));
const Train = lazy(() => import('./pages/Train'));
const Puzzles = lazy(() => import('./pages/Puzzles'));
const Openings = lazy(() => import('./pages/Openings'));
const Guess = lazy(() => import('./pages/tools/Guess'));
const MistakeReplay = lazy(() => import('./pages/tools/MistakeReplay'));
const Prevention = lazy(() => import('./pages/tools/Prevention'));
const Candidates = lazy(() => import('./pages/tools/Candidates'));
const Endgames = lazy(() => import('./pages/tools/Endgames'));
const Notebook = lazy(() => import('./pages/tools/Notebook'));
const Reflect = lazy(() => import('./pages/tools/Reflect'));
const CalendarPage = lazy(() => import('./pages/tools/Calendar'));
const Bots = lazy(() => import('./pages/Bots'));
const Settings = lazy(() => import('./pages/Settings'));
const Help = lazy(() => import('./pages/Help'));

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  extra?: boolean;
}
const NAV: NavItem[] = [
  { to: '/', label: 'Desk', icon: 'desk' },
  { to: '/play', label: 'Play', icon: 'play' },
  { to: '/bots', label: 'Bots', icon: 'bot' },
  { to: '/library', label: 'Games', icon: 'library' },
  { to: '/train', label: 'Train', icon: 'train' },
  { to: '/analysis', label: 'Analysis', icon: 'board', extra: true },
  { to: '/chesscom', label: 'Chess.com', icon: 'cloud', extra: true },
  { to: '/session', label: 'Session', icon: 'target', extra: true },
  { to: '/progress', label: 'Progress', icon: 'trophy', extra: true },
  { to: '/insights', label: 'Insights', icon: 'insights', extra: true },
  { to: '/settings', label: 'Settings', icon: 'settings', extra: true },
];

function useThemeEffects(): void {
  const [prefs] = usePrefs();
  useEffect(() => {
    const el = document.documentElement;
    if (prefs.theme === 'system') el.removeAttribute('data-theme');
    else el.dataset.theme = prefs.theme;
    if (prefs.reducedMotion === 'on') el.dataset.motion = 'off';
    else el.removeAttribute('data-motion');
    el.style.setProperty('--bs', String(prefs.boardScale / 100));
  }, [prefs.theme, prefs.reducedMotion, prefs.boardScale]);
}

function Rail() {
  const [more, setMore] = useState(false);
  const [prefs, setPrefs] = usePrefs();
  const collapsed = prefs.railCollapsed;
  const loc = useLocation();
  useEffect(() => setMore(false), [loc.pathname]);
  const trainPaths = ['/train', '/puzzles', '/openings'];
  const active = (to: string) => {
    if (to === '/') return loc.pathname === '/';
    if (to === '/train') return trainPaths.some((p) => loc.pathname === p || loc.pathname.startsWith(`${p}/`));
    return loc.pathname === to || loc.pathname.startsWith(`${to}/`);
  };
  return (
    <>
      <nav className="rail" aria-label="Main">
        <Link to="/" className="brand" aria-label="Kibitz home">
          <span className="brand-mark">
            <Icon name="knight" size={24} />
          </span>
          <span className="brand-text">Kibitz</span>
        </Link>
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} className={`rail-link ${n.extra ? 'rail-extra' : ''}`} aria-current={active(n.to) ? 'page' : undefined} title={collapsed ? n.label : undefined}>
            <Icon name={n.icon} size={22} />
            <span>{n.label}</span>
          </Link>
        ))}
        <span className="rail-spacer" />
        <Link to="/help" className="rail-link rail-extra" aria-current={active('/help') ? 'page' : undefined}>
          <Icon name="info" size={22} />
          <span>Help</span>
        </Link>
        <button type="button" className="rail-link rail-toggle" onClick={() => setPrefs({ railCollapsed: !collapsed })} aria-pressed={collapsed} title={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}>
          <Icon name={collapsed ? 'right' : 'left'} size={22} />
          <span>{collapsed ? 'Expand sidebar' : 'Collapse sidebar'}</span>
        </button>
        <button type="button" className="rail-link rail-more" onClick={() => setMore(true)} aria-haspopup="dialog">
          <Icon name="more" size={22} />
          <span>More</span>
        </button>
      </nav>
      <Dialog open={more} onClose={() => setMore(false)} title="More">
        <ul className="list-plain stack-sm">
          {[...NAV.filter((n) => n.extra), { to: '/help', label: 'Help and methods', icon: 'info' as IconName }].map((n) => (
            <li key={n.to}>
              <Link className="nav-card" to={n.to}>
                <strong>{n.label}</strong>
              </Link>
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  );
}

function Routed() {
  const loc = useLocation();
  return (
    <ErrorBoundary resetKey={loc.pathname}>
      <Suspense
        fallback={
          <div className="pad">
            <Spinner label="Loading" />
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/play" element={<Play />} />
          <Route path="/bots" element={<Bots />} />
          <Route path="/match" element={<Match />} />
          <Route path="/library" element={<Library />} />
          <Route path="/analysis" element={<Analysis />} />
          <Route path="/analysis/:id" element={<Analysis />} />
          <Route path="/chesscom" element={<ChessCom />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/session" element={<Session />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/train" element={<Train />} />
          <Route path="/puzzles" element={<Puzzles />} />
          <Route path="/openings" element={<Openings />} />
          <Route path="/train/guess" element={<Guess />} />
          <Route path="/train/mistakes" element={<MistakeReplay />} />
          <Route path="/train/prevention" element={<Prevention />} />
          <Route path="/train/candidates" element={<Candidates />} />
          <Route path="/train/endgames" element={<Endgames />} />
          <Route path="/train/notebook" element={<Notebook />} />
          <Route path="/train/reflect" element={<Reflect />} />
          <Route path="/train/reflect/:id" element={<Reflect />} />
          <Route path="/train/calendar" element={<CalendarPage />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/help" element={<Help />} />
          <Route
            path="*"
            element={
              <div className="empty">
                <h3>That page does not exist</h3>
                <p>
                  <Link to="/">Go to the desk</Link>
                </p>
              </div>
            }
          />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export function App() {
  useThemeEffects();
  const [prefs, setPrefs] = usePrefs();
  // Analyses saved by an earlier version are brought up to the current grade format from their stored evaluations
  // (no engine needed). It is a no-op once every analysis is current.
  useEffect(() => {
    const t = window.setTimeout(() => void import('./lib/analysis/gameAnalysis').then((m) => m.migrateStoredAnalyses()).catch(() => undefined), 1500);
    return () => window.clearTimeout(t);
  }, []);
  // Games without an analysis are analysed in the background (a setting, on by default).
  useEffect(() => {
    let stop: (() => void) | undefined;
    void import('./services/autoAnalyse').then((m) => {
      stop = m.startAutoAnalyse();
    });
    return () => stop?.();
  }, []);
  // Automatic backup (if switched on in Settings): at most one file a day, written shortly after start-up.
  useEffect(() => {
    const t = window.setTimeout(() => void import('./lib/storage/autoBackup').then((m) => m.runAutoBackup({ onlyIfDue: true })).catch(() => undefined), 8000);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <HashRouter>
      {/* With a hash router, a plain href="#main" would be read as the route "/main". Focus the region instead. */}
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          const main = document.getElementById('main');
          main?.focus();
          main?.scrollIntoView?.({ block: 'start' });
        }}
      >
        Skip to content
      </a>
      <div className="shell" data-collapsed={prefs.railCollapsed ? 'true' : 'false'}>
        <Rail />
        <main className="main" id="main" tabIndex={-1}>
          <div className="page">
            <JobsBar />
            <Routed />
          </div>
        </main>
      </div>
      <Toasts />
      <Onboarding open={!prefs.onboarded} onDone={() => setPrefs({ onboarded: true })} />
    </HashRouter>
  );
}
