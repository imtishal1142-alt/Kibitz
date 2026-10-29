# Connecting to Chess.com

## What you need

Only your **Chess.com username**. No password, no login, no API key, no OAuth. The app uses Chess.com's official **Published-Data API**, which serves *public* information, so only public data can be fetched. Open **Chess.com** in the sidebar, type the username, and press **Import games**. The username can also be stored in Settings, under Training.

**No scraping.** The app never loads chess.com web pages and never reads anything that needs a login. It does not ask for, store or send credentials of any kind.

## What is requested

All requests are `GET`s with the header `Accept: application/json` and nothing else (a header like that does not trigger a browser CORS preflight; browsers also do not let a page set `User-Agent`). They go from your browser straight to `https://api.chess.com/pub`; no server of ours is involved.

| Endpoint | Used for |
| --- | --- |
| `/player/{username}` | Profile: name, avatar URL, country, join date, status. |
| `/player/{username}/stats` | Current ratings per time class (bullet, blitz, rapid, daily), best ratings and win/draw/loss counts. Optional: if it fails for another reason than cancel or rate limit, the import carries on without ratings. |
| `/player/{username}/games/archives` | The list of monthly archive URLs. |
| each URL from that list (`/player/{username}/games/{YYYY}/{MM}`) | The games of one month, with PGN. |

The only other request is the **avatar image**, shown on the profile card, which the browser loads from Chess.com's image server. It is sent without a referrer.

## How an import works

1. The username is validated (3 to 25 characters; letters, digits, underscore, hyphen). Usernames are not case-sensitive.
2. Profile and stats are fetched and stored, with the **time they were fetched** and their source shown on screen.
3. The archive list is fetched and walked **newest month first**, one month at a time. Progress shows the month, games seen, new and already-saved games.
4. Each game is converted to a stored record. Games that are not standard chess (other variants), have no PGN, or whose PGN cannot be read are skipped and **counted by reason in the summary** ("3 chess variants, 1 with unreadable moves").
5. Which side is "you" is decided from the usernames in the API data, not the PGN names.
6. **Duplicates** are prevented by the game's Chess.com id and by a content fingerprint, so the same game arriving by PGN paste and by API is stored once ("N new games added, M already saved").
7. **Incremental sync.** Press **Sync new games** later. A month is marked *final* when it was fetched at least a day after the month ended, and final months are not downloaded again. The current month (and the previous one until it is final) is checked each time. A "download every month again" option forces a full re-import; it still creates no duplicates.
8. **Cancel** aborts the request in flight and stops. Games already fetched stay saved, and the summary says it was cancelled.

## Rate limits, retries and errors

- Requests are strictly **serial**, with at least 250 ms between them (Chess.com allows serial access without limit but may answer parallel bursts with HTTP 429).
- A `429` or a server error (`5xx`) is retried up to **4 times** with exponential backoff plus up to 250 ms of random jitter, honouring a `Retry-After` header. If it still fails, the import stops early, keeps what it has and says so; a later sync resumes.
- A network failure (offline, an extension or network blocking `api.chess.com`) is retried only **twice** and then reported plainly ("Could not reach Chess.com…"), instead of making you wait.
- An unknown username (`404`) gets its own message that asks you to check the spelling.
- Nothing is lost on a failure. You can always paste or upload a PGN in **Games**, then **Add games or a position**.

## What the API cannot do

- **No rating history.** There is no endpoint for it. The app shows the current ratings and a sparkline built from the rating recorded in each game you imported, and labels it that way.
- **No private data.** Games from private accounts, or anything behind a login, are not available.
- **Rate and availability are Chess.com's.** The service can be down or change. The API is documented at https://www.chess.com/news/view/published-data-api.

## Verification status: please read

The sandbox this app was built in could **not reach `api.chess.com`**. The client and the import were tested against:

- unit tests with a scripted `fetch` (valid and invalid usernames, retry and backoff timing with `Retry-After`, 429 then success, 404, network errors, cancellation, duplicate handling, caching of final months, skipped games), and
- browser tests that intercept every `api.chess.com` request and answer with fixtures in the documented shapes. These are named "[MOCKED API]" in the test output.

So the **code paths are tested, but a live import has not been observed by the author**. In particular, whether the live API sends the CORS headers a browser needs for a page on your site's origin could not be confirmed here; the published API is generally used from browsers, but treat a live import failing with a "could not reach" message on a network that is otherwise fine as a possible bug or CORS problem and report it. The fallback (paste or upload a PGN) always works.

## Privacy

Chess.com sees an ordinary request from your browser, as it would from any website calling its public API (your IP address and the request itself). The app sends it nothing about you beyond the username you typed. Imported games are stored in your browser only ([DATA.md](DATA.md)).
