# Pages in their own files: design

Date: 2026-10-29
Builds on: Fast loading (games in their own files, the service worker in `sw.js`)

## Why

Everything lived in `index.html` (about 500 KB). The owner wants every page in its own files, so ONE stays fast and easy to grow (Telegram is next), and switching pages must never wait.

## Decisions

| Question | Decision |
|---|---|
| One HTML page per section? | No. A separate HTML page would reload React, the store and the sound engine on every switch: a wait each time, and music would stop. Each page is a script plus a stylesheet, loaded into the one page, the same way the games are. |
| Where the pages live | `pages/<id>/<id>.js` and `pages/<id>/<id>.css` for `home`, `tasks`, `websites`, `ideas`, `saved`, `goals`, `knowledge` (Notes) and `preferences` (Settings). |
| What stays in `index.html` | The shell: design tokens and shared styles, icons, the store, sync, the lock, sounds, the page bar and dock, quick capture, search, the editors and the loader. Anything two pages share stays here too. |
| Waiting when switching | None after the first second: the open page loads first, the rest load in the background as soon as the browser is idle. |

## How it works

- **Handshake.** `index.html` sets `window.__oneApp` (React and the shared pieces each page uses). Each page file is an ordinary script that reads it and registers its component as `window.__onePages[id]`.
- **First screen.** A small script in `<head>` reads the `#route` and preloads that page's two files alongside React, so the first screen doesn't wait for them afterwards.
- **`loadPage(id)`** adds the page's `<link>` and `<script>`, resolves when both have loaded and the page has registered, and forgets a failure, so the next try starts fresh.
- **Switching.** `useShownPage` shows the route's page as soon as it's in. Until then the page already on screen stays (nothing goes blank), and `.app` carries `aria-busy`.
  - If a page can't load, a toast says *"Couldn't open this page. Check your connection and try again."* and ONE goes back to the page that was showing.
  - If the very first page can't load, the page says so, with a **Try again** button.
- **Styles keep their order.** A page's stylesheet loads after `index.html`'s, so a rule only moves to a page file when that can't change which rule wins. A rule stays in `index.html` when a later rule there:
  - has the same specificity,
  - sets an overlapping property,
  - and could match the same element (its classes can appear together in one `className`).

  A check of every element's computed style on all eight pages (light and dark, 1280 px and 375 px, with and without reduced motion), with each page loaded on its own, matches the old single file exactly.
- **Offline and updates.** `sw.js` saves all page files on install (cache `one-v8`), and `updateApp()` fetches and saves them with the rest, all or nothing.

## Testing

`tests/pages-load.test.cjs`:
- every page has its own files;
- the open page loads first and the rest follow in the background;
- switches take under 100 ms once loaded;
- a slow page keeps the current one on screen;
- a failed page shows the toast and goes back;
- a failed first page offers Try again.

The service worker and update tests cover the new file list.
