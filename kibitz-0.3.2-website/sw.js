// Kibitz service worker: makes the app load and run with no network.
//
// At build time scripts/postbuild.mjs fills in VERSION (a hash of the build) and PRECACHE (every file of the build).
// The first visit stores them all, so afterwards the app, the chess engine and the opening list work offline.
// Only same-origin GET requests are handled: calls to Chess.com's public data API always go to the network.
// A new version installs in the background and takes over the next time every Kibitz tab has been closed, so a tab
// that is open is never switched to different code half-way through.
const VERSION = '8299b84b1b60';
const PRECACHE = ["./","./_headers","./assets/Analysis-BsNSrCDI.js","./assets/AutoBackup-DGqmSnCY.js","./assets/Board-BOdxE2zI.js","./assets/Bots-bHbvTEEl.js","./assets/Calendar-CdVwAATg.js","./assets/Candidates-KrUjLvjW.js","./assets/ChessCom-A9VUjjCW.js","./assets/ClassBadge-BKh8gpee.js","./assets/Endgames-BgsW-6fy.js","./assets/GamePicker-CgAFJeFY.js","./assets/GradeIcon-uRaDgrk0.js","./assets/Guess-rhQXhFn9.js","./assets/Help-x9uB9brN.js","./assets/Home-BUtXL6ud.js","./assets/Insights-B7NcZq2g.js","./assets/Library-y8mAwu3H.js","./assets/Match-DXvlD0wo.js","./assets/MistakeReplay-h29d6UH9.js","./assets/MoveGrades-CUL10hjX.js","./assets/Notebook-ChaPXw76.js","./assets/Openings-BLXjX0P1.js","./assets/Play-B2iUt84O.js","./assets/Prevention-CeaJidQo.js","./assets/Progress-CNRiD18z.js","./assets/Puzzles-CS5NquSs.js","./assets/Pv-CneBzpX2.js","./assets/Reflect-90UjV_7R.js","./assets/Session-D4F_r1Oi.js","./assets/Settings-CvYuu93A.js","./assets/StreakCard-yPGzmC5r.js","./assets/TimeUse-BHj4ZEEm.js","./assets/Train-61ejLHrw.js","./assets/assess-BiaCKI0s.js","./assets/autoAnalyse-8q3aCKTl.js","./assets/autoBackup-CRDQYzwa.js","./assets/board-C7rAH2D3.js","./assets/bots-B4cSpEl1.js","./assets/bricolage-grotesque-latin-ext-wdth-normal-DoS1gVTC.woff2","./assets/bricolage-grotesque-latin-wdth-normal-Dtb2a5nO.woff2","./assets/bricolage-grotesque-vietnamese-wdth-normal-BKE08zty.woff2","./assets/captured-DmDXFpGE.js","./assets/chess-DR6a3x3O.js","./assets/classify-DvbGwiZC.js","./assets/data-BnKe58YM.js","./assets/eval-i0OlatMX.js","./assets/explain-Blydo9Ot.js","./assets/format-BWmqDsrj.js","./assets/gameAnalysis-yEiwvKCz.js","./assets/grades-BpZXHl54.js","./assets/guess-Dnjo-Pan.js","./assets/ibm-plex-sans-latin-400-normal-CDDApCn2.woff2","./assets/ibm-plex-sans-latin-400-normal-CYLoc0-x.woff","./assets/ibm-plex-sans-latin-500-normal-6ng42L7E.woff2","./assets/ibm-plex-sans-latin-500-normal-BgVn5rGT.woff","./assets/ibm-plex-sans-latin-600-normal-Cu4Hd6ag.woff","./assets/ibm-plex-sans-latin-600-normal-CuJfVYMP.woff2","./assets/index-N5v5q5d1.css","./assets/index-Vt9F34tz.js","./assets/openings-CeO4a95q.js","./assets/openings-nUF-ttjX.js","./assets/playEngine-Cf6AEyrM.js","./assets/prefs-CJJc_nh6.js","./assets/react-in2-uo6V.js","./assets/repertoire-BXWonU6v.js","./assets/repos-DA27-K3S.js","./assets/retest-BhYqOIV8.js","./assets/review-p766NPW9.js","./assets/rolldown-runtime-XKyaHtl9.js","./assets/rules-Ae3WjXIM.js","./assets/session-tuV5uWxa.js","./assets/sound-Dhp8rR0B.js","./assets/srs-CG15ca1S.js","./assets/store-DB68MskS.js","./assets/tactics-CqnTClSw.js","./assets/timeAnalysis-DJZ_r5Qi.js","./assets/useHotkeys-CCNQaTX4.js","./assets/useNow-BzEpj5GS.js","./assets/useQuery-BgYOgknF.js","./assets/weaknesses-Dt4g4GbH.js","./assets/weakspots-Cj22AIiC.js","./engines/LICENSE-stockfish-GPL-3.0.txt","./engines/NOTICE.txt","./engines/manifest.json","./engines/stockfish-19-asm.js","./engines/stockfish-19-lite-single.js","./engines/stockfish-19-lite-single.wasm","./engines/stockfish-19-lite.js","./engines/stockfish-19-lite.wasm","./icons/apple-touch-icon.png","./icons/icon-192.png","./icons/icon-512.png","./icons/icon-maskable-512.png","./icons/icon-maskable.svg","./icons/icon.svg","./index.html","./manifest.webmanifest"];
const CACHE = `kibitz-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith('kibitz-') && key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      if (req.mode === 'navigate') {
        // The app is one page (hash routes), so every navigation gets the cached index.html.
        const page = await cache.match('./index.html');
        if (page) return page;
        return fetch(req);
      }
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(req, res.clone()).catch(() => undefined);
      return res;
    })(),
  );
});
