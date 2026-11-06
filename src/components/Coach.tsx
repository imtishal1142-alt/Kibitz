import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { CoachAvatar } from './CoachAvatar';
import type { Mood } from './CoachAvatar';
import { Icon } from './Icon';
import { usePrefs } from '../hooks/usePrefs';
import { speak, speechAvailable, stopSpeaking, useSpeaking } from '../services/speech';

/** The coach with a speech bubble. `text` is read aloud when voice is on and `autoSpeak` is set. */
export function Coach({ mood = 'idle', text, children, actions, compact, autoSpeak, title }: { mood?: Mood; text: ReactNode; children?: ReactNode; actions?: ReactNode; compact?: boolean; autoSpeak?: boolean; title?: string }) {
  const [prefs] = usePrefs();
  const speaking = useSpeaking();
  const plain = typeof text === 'string' ? text : '';
  const last = useRef('');
  useEffect(() => {
    if (!prefs.coach || !prefs.coachVoice || !autoSpeak || !plain || last.current === plain) return;
    last.current = plain;
    speak(plain, { voiceName: prefs.coachVoiceName, rate: prefs.coachRate });
  }, [plain, autoSpeak, prefs.coach, prefs.coachVoice, prefs.coachVoiceName, prefs.coachRate]);
  useEffect(() => () => stopSpeaking(), []);
  if (!prefs.coach) return null;
  const canSpeak = speechAvailable() && plain.length > 0;
  return (
    <section className={`kibi${compact ? ' kibi-compact' : ''}`} aria-label="Coach Kibi">
      <div className="kibi-figure">
        <CoachAvatar mood={mood} size={compact ? 56 : 84} speaking={speaking} />
      </div>
      <div className="kibi-bubble" role="status" aria-live="polite">
        {title ? <div className="kibi-title">{title}</div> : null}
        <p className="kibi-text">{text}</p>
        {children}
        {(actions || canSpeak) && (
          <div className="row kibi-actions">
            {actions}
            {canSpeak && (
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => (speaking ? stopSpeaking() : speak(plain, { voiceName: prefs.coachVoiceName, rate: prefs.coachRate }))} aria-label={speaking ? 'Stop reading aloud' : 'Read aloud'}>
                <Icon name={speaking ? 'pause' : 'play'} size={14} /> {speaking ? 'Stop' : 'Listen'}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
