# Your data: storage, backup, restore and deletion

## Where it lives

Everything is stored **in your browser, on your device**. Nothing is uploaded; the app has no server and no account. The only network traffic the app starts is the Chess.com import you request (including your avatar image) and loading the app's own files.

| What | Where |
| --- | --- |
| Games, analyses, puzzles and their schedule, attempts, notebook, repertoire, strength reports, reflections, calendar, Chess.com profile and archive bookkeeping, the evaluation cache | **IndexedDB**, database `kibitz` (schema version 1; versioned upgrades are in `src/lib/storage/db.ts`) |
| Settings (theme, engine choice, daily goal, Chess.com username…) | **localStorage**, key `kibitz.prefs.v1` (with an in-memory fallback if storage is blocked) |

The 14 IndexedDB stores are `games`, `analyses`, `evalCache`, `puzzles`, `puzzleSrs`, `attempts`, `notebook`, `repertoire`, `strength`, `calendar`, `reflections`, `profiles`, `archives` and `kv`.

Consequences, stated plainly:

- Data belongs to **one browser profile on one origin** (scheme, host and port). Another browser, another device, a private window, or a different address has its own empty copy.
- **Clearing site data in the browser, or private browsing, erases it all.** Browsers can also evict site data under storage pressure unless the site is granted persistent storage; the app does not currently request it.
- Games are de-duplicated on the way in (by Chess.com id and by a content fingerprint), so re-importing is safe.
- No secrets are stored or needed. The Chess.com username is public.

## Back up

**Settings, Privacy and data, Download backup** saves one JSON file:

```json
{ "app": "kibitz", "schema": 1, "exportedAt": "…", "prefs": { … }, "stores": { "games": [ … ], … } }
```

It contains every store and your settings, **except the evaluation cache**, which can be recomputed and would make the file large; a checkbox adds it if you want it. Keep the file somewhere you trust: it holds your games and notes in readable form.

## Restore

**Settings, Privacy and data, Restore**: choose the file, then **Merge into my data** or **Replace my data** (which asks for confirmation).

- The file is checked first. A file that is not JSON, does not say `"app": "kibitz"`, has a newer schema than the app understands, or has unknown or malformed sections is **refused with a message** and nothing is changed.
- **Merge** adds to what is there. Games are added unless already present (duplicates are skipped). Attempts and strength reports (which have no natural key) are compared by content, so merging the same backup twice does not double them. Every other store is written by key: a row with the same key (for example the analysis of the same game) is replaced by the backup's version. Your current settings are kept.
- **Replace** first clears all stored data, then loads the backup including its settings.
- The result is a count per store of what was added.

The round trip (download, delete everything, restore, data comes back; a bad file is refused) is covered by a browser test, and the merge rules by unit tests.

## Clear and reset

**Settings, Privacy and data** also offers:

- **Clear cached evaluations**: frees space; analyses already stored are kept, and positions are simply re-searched when needed.
- **Reset settings**: returns preferences to their defaults; games and everything else stay.
- **Delete all my data**: asks you to type `DELETE`, then deletes the whole IndexedDB database and the settings. This cannot be undone, so download a backup first if you might want anything back. After it, the app shows its first-run welcome again.

The storage section shows how many items each store holds and, where the browser reports it, how much space is used.

## Privacy summary

No analytics, no tracking, no advertising, no cookies set by the app. Fonts are bundled with the app. The engine runs locally in a Web Worker. If you host Kibitz yourself, your host's own server logs will, as for any site, record that your browser fetched the app's files.

## Added in version 0.2

- **`kv` keys**: `retest.v1` (per-mistake schedule), `reviewedGames.v1` (games taken through the guided review), `endgames.v1` (attempts and successes per ending). The calendar day record gained optional `retests` and `gamesReviewed` counts. The database version is unchanged.
- **Device keys**: `kv` keys starting `device.` (the automatic-backup settings and, in Chromium browsers, the handle of the backup folder) describe this device. They are never written into a backup file, are ignored if a file contains them, and survive a "replace" restore.
- **Automatic backup**: files named `kibitz-backup-YYYY-MM-DD.json`, the same format as the manual backup (without cached engine evaluations), written at most once a day, newest 7 kept. The app creates, replaces and deletes only files with exactly that name pattern. In the desktop app the chosen folder is stored in `desktop-config.json` in the app's data folder.
- **Offline cache**: the service worker keeps one cache named `kibitz-<build hash>`; older ones are deleted when a new version takes over.
- **Analyses** are version 2: stored analyses from version 0.1 are upgraded in the background from their stored evaluations (no engine needed), and nothing is lost.
