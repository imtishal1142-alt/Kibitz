// Kibitz service worker: makes the app load and run with no network.
//
// At build time scripts/postbuild.mjs fills in VERSION (a hash of the build) and PRECACHE (every file of the build).
// The first visit stores them all, so afterwards the app, the chess engine and the opening list work offline.
// Only same-origin GET requests are handled: calls to Chess.com's public data API always go to the network.
// A new version installs in the background and takes over the next time every Kibitz tab has been closed, so a tab
// that is open is never switched to different code half-way through.
const VERSION = 'bc65216df0c1';
const PRECACHE = ["./","./_headers","./assets/Analysis-B8qMH9Q-.js","./assets/AutoBackup-17MYRmMd.js","./assets/Board-BodFoV_q.js","./assets/Bots-C62fRpe_.js","./assets/Calendar-CrA3MZ3N.js","./assets/Candidates-BTuu2xuy.js","./assets/ChessCom-CAMDzZcw.js","./assets/ClassBadge-BDImRmn0.js","./assets/Endgames-Bdvzq1Iu.js","./assets/GamePicker-BdIfd6Gw.js","./assets/GradeIcon-CJbwqOPW.js","./assets/Guess-CnRU-Okt.js","./assets/Help-TC5m8kpW.js","./assets/Home-C4WfR1Up.js","./assets/Insights-DdrVRS3P.js","./assets/Library-CzCW3brl.js","./assets/Match-BY--kgtT.js","./assets/MiniBoard-ggNXLCV3.js","./assets/MistakeReplay-DPgSx_3s.js","./assets/MoveGrades-CIaecnlv.js","./assets/Notebook-BMLJ1RIv.js","./assets/Openings-BBvBYM4X.js","./assets/Play-Bxmlxw1y.js","./assets/Prevention-WKgiqDTV.js","./assets/Progress-DObbz1mK.js","./assets/Puzzles-DOB6SveT.js","./assets/Pv-CneBzpX2.js","./assets/Reflect-8SoeWW6K.js","./assets/Session-PtszkxAt.js","./assets/Settings-BUA-e2Ot.js","./assets/StreakCard-Bbc6Et5T.js","./assets/TimeUse-BHj4ZEEm.js","./assets/Train-BZajBVF-.js","./assets/assess-BiaCKI0s.js","./assets/autoAnalyse-DJrtRMsY.js","./assets/autoBackup-CRDQYzwa.js","./assets/board-C7rAH2D3.js","./assets/bots-B4cSpEl1.js","./assets/bricolage-grotesque-latin-ext-wdth-normal-DoS1gVTC.woff2","./assets/bricolage-grotesque-latin-wdth-normal-Dtb2a5nO.woff2","./assets/bricolage-grotesque-vietnamese-wdth-normal-BKE08zty.woff2","./assets/captured-BlDalXrq.js","./assets/chess-DR6a3x3O.js","./assets/classify-DvbGwiZC.js","./assets/data-Cnr2bCBi.js","./assets/eval-i0OlatMX.js","./assets/explain-Blydo9Ot.js","./assets/format-DL-fGpuF.js","./assets/gameAnalysis-yEiwvKCz.js","./assets/grades-BpZXHl54.js","./assets/guess-Dnjo-Pan.js","./assets/ibm-plex-sans-latin-400-normal-CDDApCn2.woff2","./assets/ibm-plex-sans-latin-400-normal-CYLoc0-x.woff","./assets/ibm-plex-sans-latin-500-normal-6ng42L7E.woff2","./assets/ibm-plex-sans-latin-500-normal-BgVn5rGT.woff","./assets/ibm-plex-sans-latin-600-normal-Cu4Hd6ag.woff","./assets/ibm-plex-sans-latin-600-normal-CuJfVYMP.woff2","./assets/index-CbzG-7HT.css","./assets/index-Cg24OtYR.js","./assets/openings-CeO4a95q.js","./assets/openings-nUF-ttjX.js","./assets/playEngine-BXQmoWRH.js","./assets/prefs-CJJc_nh6.js","./assets/react-in2-uo6V.js","./assets/repertoire-BXWonU6v.js","./assets/repos-DA27-K3S.js","./assets/retest-BhYqOIV8.js","./assets/review-p766NPW9.js","./assets/rolldown-runtime-XKyaHtl9.js","./assets/rules-Ae3WjXIM.js","./assets/session-9SrUWs-i.js","./assets/sound-Dhp8rR0B.js","./assets/srs-CG15ca1S.js","./assets/store-DB68MskS.js","./assets/tactics-CqnTClSw.js","./assets/timeAnalysis-DJZ_r5Qi.js","./assets/useHotkeys-CCNQaTX4.js","./assets/useNow-0cV4MCpZ.js","./assets/useQuery-BgYOgknF.js","./assets/weaknesses-Dt4g4GbH.js","./assets/weakspots-Cj22AIiC.js","./engines/LICENSE-stockfish-GPL-3.0.txt","./engines/NOTICE.txt","./engines/manifest.json","./engines/stockfish-19-asm.js","./engines/stockfish-19-lite-single.js","./engines/stockfish-19-lite-single.wasm","./engines/stockfish-19-lite.js","./engines/stockfish-19-lite.wasm","./icons/apple-touch-icon.png","./icons/icon-192.png","./icons/icon-512.png","./icons/icon-maskable-512.png","./icons/icon-maskable.svg","./icons/icon.svg","./index.html","./manifest.webmanifest"];
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
