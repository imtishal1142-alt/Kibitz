import { reloadForNewVersion } from './lib/lazyRetry';
import '@fontsource-variable/bricolage-grotesque/wdth.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import './styles/app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline support: store the app on first visit. Not in development, not in the desktop app (which ships its own
// files), and not from file:// (service workers need http or https).
if (import.meta.env.PROD && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !window.kibitz?.desktop) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => undefined);
  });
}

// Vite fires this when a file needed by a page cannot be fetched (typically after a new deploy replaced it).
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  void reloadForNewVersion();
});
