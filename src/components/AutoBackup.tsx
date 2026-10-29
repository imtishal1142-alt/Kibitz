import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AUTO_BACKUP_KEEP, chooseBackupFolder, disableAutoBackup, lastBackupAt, readAutoBackup, regrantFolder, runAutoBackup } from '../lib/storage/autoBackup';
import type { AutoBackupState } from '../lib/storage/autoBackup';
import { formatDateTime } from '../lib/ui/format';
import { useGames } from '../hooks/data';
import { toast } from '../services/toast';
import { Banner } from './ui';

/** Automatic backups to a folder: set-up, status, and a "back up now" button. */
export function AutoBackup() {
  const [st, setSt] = useState<AutoBackupState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void readAutoBackup().then((s) => live && setSt(s));
    return () => {
      live = false;
    };
  }, []);
  const act = useCallback(async (fn: () => Promise<AutoBackupState>, ok?: string) => {
    setBusy(true);
    try {
      setSt(await fn());
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }, []);
  if (!st) return null;
  const where = st.support === 'desktop' ? 'the folder you choose' : 'a folder you choose on this computer';
  return (
    <div className="stack-sm" aria-label="Automatic backup" role="group">
      <h3 style={{ fontSize: '1rem' }}>Automatic backup</h3>
      {st.support === 'none' ? (
        <p className="muted small" style={{ margin: 0 }}>
          This browser cannot write files in the background. Use Download backup now and then, or open Kibitz in Chrome or Edge, or in the desktop app, to back up automatically. Kibitz will remind you when it has been a while.
        </p>
      ) : (
        <>
          <p className="muted small" style={{ margin: 0 }}>
            Once a day, when you open the app, Kibitz saves a backup file into {where} and keeps the newest {AUTO_BACKUP_KEEP}. It only ever replaces its own files (kibitz-backup-DATE.json).
          </p>
          {st.enabled ? (
            <>
              <p style={{ margin: 0 }}>
                <strong>On.</strong> Folder: <code>{st.folder ?? 'chosen'}</code>.{' '}
                {st.lastAt ? `Last backup ${formatDateTime(st.lastAt)}${st.lastFile ? ` (${st.lastFile})` : ''}.` : 'No backup written yet.'}
              </p>
              {st.lastError ? <Banner kind="bad" role="alert">{st.lastError}</Banner> : null}
              {st.needsPermission ? <Banner kind="warn">Your browser wants permission to write to that folder again.</Banner> : null}
              <div className="row">
                {st.needsPermission ? (
                  <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void act(() => regrantFolder().then(() => runAutoBackup()), 'Backup saved.')}>
                    Allow and back up
                  </button>
                ) : (
                  <button className="btn" type="button" disabled={busy} onClick={() => void act(() => runAutoBackup(), 'Backup saved.')}>
                    Back up now
                  </button>
                )}
                <button className="btn" type="button" disabled={busy} onClick={() => void act(() => chooseBackupFolder())}>
                  Change folder
                </button>
                {st.support === 'desktop' ? (
                  <button className="btn" type="button" onClick={() => void window.kibitz?.backup.reveal()}>
                    Show folder
                  </button>
                ) : null}
                <button className="btn" type="button" disabled={busy} onClick={() => void act(() => disableAutoBackup())}>
                  Turn off
                </button>
              </div>
            </>
          ) : (
            <div>
              <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void act(() => chooseBackupFolder().then((s) => (s.enabled ? runAutoBackup() : s)))}>
                Choose a folder and turn on
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const REMIND_AFTER_MS = 14 * 24 * 3600 * 1000;

/** A gentle reminder on Home: you have games but no recent backup. Hidden when automatic backup is working. */
export function BackupReminder() {
  const games = useGames();
  const [due, setDue] = useState(false);
  const count = games.data?.length ?? 0;
  useEffect(() => {
    if (!count) return;
    let live = true;
    void (async () => {
      const [last, auto] = await Promise.all([lastBackupAt(), readAutoBackup()]);
      const stale = last === undefined || Date.now() - last > REMIND_AFTER_MS;
      if (live) setDue(stale && !(auto.enabled && !auto.lastError));
    })();
    return () => {
      live = false;
    };
  }, [count]);
  if (!due) return null;
  return (
    <Banner kind="info">
      <div>
        Your {count} saved game{count === 1 ? '' : 's'} live only in this browser, and there is no recent backup. <Link to="/settings">Back up now</Link>.
      </div>
    </Banner>
  );
}
