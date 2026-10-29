# Telegram in ONE: design

Date: 2026-10-29
Status: draft, waiting for review
Builds on: pages in their own files (`pages/<id>/`), the PIN lock, Supabase sync

## Why

The owner works in Telegram, mostly replying in private chats with people. They want to do that work in ONE:

- When ONE opens, it says who is waiting for an answer.
- It says whom to answer first, by a priority the owner sets.
- The owner opens a chat and replies as themselves.

## Decisions already made

| Question | Decision |
|---|---|
| Which chats | Private chats with people only. Groups and channels come later. |
| Acting as the owner | Yes: ONE logs in to the owner's own account (Telegram's user API, MTProto), not a bot. |
| Server | None. Telegram runs inside ONE in the browser, through GramJS. |
| Auto-reply | Not now. It may come later, and would then need a small always-on server. |
| Priority | Levels (High, Normal, Low) plus waiting time. A chat that waits past its level's time limit moves up one level. |
| Time limits | Set in Settings. They start as Normal 3 hours and Low 12 hours. |
| Look | ONE's own design throughout. GramJS gives data only; ONE draws every screen. |

## 1. Parts and where they live

- **Telegram tab.**
  - A new dock page, `telegram`, built like the others: `pages/telegram/telegram.js` and `pages/telegram/telegram.css`.
  - It is added to `PAGE_IDS`, the `<head>` preload list, `sw.js` `SHELL` and `updateApp`'s file list.
- **The library.**
  - A pinned GramJS release (npm package `telegram`), bundled once into one file: `pages/telegram/gramjs.js`.
  - It is committed, so ONE keeps no build step. The bundling command is written at the top of the file.
  - It loads only when it is needed (see Connection).
- **The wrapper.** `pages/telegram/client.js` is the only code that touches GramJS. It offers:
  - `connect()`, `logout()`
  - `startQrLogin(onQr)`, `sendCode(phone)`, `signIn(code)`, `checkPassword(pw)`
  - `listPrivateChats()`, `getMessages(chatId, { before, limit })`, `markRead(chatId)`
  - `sendMessage(chatId, text, { replyTo })`, `downloadMedia(message)`
  - `onUpdate(handler)`: new message, read, typing, connection state, logged out

  Tests swap it for a fake with the same shape.
- **Connection.**
  - Once the owner has logged in on a device, ONE connects in the background after the first render, when idle. The Home card can then show who's waiting without the Telegram tab being opened.
  - With no login on the device, nothing Telegram-related loads at all.
- **What's stored where.**
  - **This device only, never synced:**
    - the Telegram session string and the app key (`api_id`, `api_hash`), in `localStorage` under `one.telegram.device.v1`;
    - hidden while ONE is locked.
  - **Workspace data (synced like everything else):** `telegram: { chats: { [userId]: { level, name } }, limits: { normal: 180, low: 720 } }`. Minutes; `name` is a fallback for display.
  - **Not stored:** messages, which come from Telegram. A small device cache (IndexedDB, the latest 50 per chosen chat) lets chats open instantly and the Home card show the last known list when offline.
- **App key.**
  - Telegram requires every third-party app to have its own key from my.telegram.org.
  - The owner enters it once per device. It is never put in the repository.

## 2. Logging in and choosing chats

**Connecting.** In Settings → Telegram, or on the Telegram tab before connecting:

1. **App key.** A three-step how-to with a link to my.telegram.org, and two fields: *api_id* and *api_hash*.
2. **Log in** (the owner picks one):
   - **QR code (default).** Scan it from Telegram on the phone (Settings → Devices → Link Desktop Device).
   - **Phone number.** Telegram sends a code to the Telegram app; the owner types it in.
   - Either way, if the account has a cloud password (2FA), ONE asks for it next.
3. **Connected.**
   - Settings shows "Connected as <name> (@username)" and **Log out**.
   - Log out ends the session in Telegram as well and clears the device data.

ONE appears in Telegram's Active sessions, so it can be disconnected from the phone at any time.

**Errors:**
- *"That code didn't work. Send a new one?"* for a wrong or expired code;
- *"That password didn't work. Try again."*;
- *"Telegram asks you to wait N minutes before trying again."* when Telegram makes the owner wait.

**Choosing chats.**
- The first visit to the Telegram tab lists private chats, newest first, with search.
  - Each row has photo, name and **High · Normal · Low · Not in ONE**. Every chat starts as Not in ONE.
  - Bots, deleted accounts and Saved Messages are left out.
- Levels can change later from a chat's header or from **Manage chats**.
- New people who write are not added automatically. A quiet line, *"2 new chats in Telegram"*, opens Manage chats.

**While ONE is locked,** nothing from Telegram shows: no names, no messages, no Home card, no badge.

## 3. Waiting, moving up, and the Home card

**When a chat is waiting.**
- It waits while the latest message is theirs and the owner hasn't replied since.
- The wait counts from their *first* unanswered message.
- It stops waiting when the owner replies (from ONE or any Telegram app) or taps **No reply needed**. That choice is stored per chat as the message id it covers, so the chat waits again when they write again.
- Reading alone doesn't count as answering.

**Moving up.**
- Each time a chat waits past the limit of its current level, it moves up one level.
- With the starting limits, a Low chat is Normal after 12 h and High after 15 h (12 + 3).
- A Normal chat is High after 3 h. High never moves.
- Answering returns a chat to its own level.

**Order.**
- Higher current level first. Within a level, the longest wait first.
- This is computed by one pure function, `waitingOrder(chats, now, limits)`. It runs every minute and on every update.

**Home card.**
- *"You have messages from **A**, **B** and **C**."* Then *"Answer **A** first: waiting 5 h. Then B, then C."*
- It names up to three people, then *"and N more"*.
- Each name is a button with a level dot, and opens that chat.
- A chat that moved up says so: *"waiting 13 h, moved up from Low"*.
- **No one waiting:** *"All caught up on Telegram."*
- **Unreachable:** the last known list, with *"Telegram isn't reachable right now."*
- **Not connected:** no card at all.

**Dock.** The Telegram tab shows a badge with the number of waiting chats, like the Tasks badge.

## 4. The Telegram tab and errors

**Layout.**
- From 900 px up: the list on the left, the open chat on the right.
- Narrower: the list, then the chat full screen with a back button.
- The list has **Waiting** (in `waitingOrder`), then the other chosen chats by level, then by latest message.

**A chat.**
- **Header:**
  - photo, name, "online" / "last seen …";
  - a level menu;
  - **Open in Telegram** (`https://t.me/<username>`, or `tg://user?id=<id>`).
- **Messages:**
  - Bubbles (theirs left, owner's right), day separators, and read ticks on the owner's.
  - The latest 50; scrolling up loads 50 older at a time.
  - Text with links, replies with a quote of the original, photos (preview, tap for full size), files (name, size, download).
  - Anything else shows a label, such as *"Sticker"*, *"Voice message"* or *"Video"*, linked to Open in Telegram.
  - *"typing…"* while they type.
- **Read receipts:** opening a chat marks it read in Telegram, as Telegram's own apps do.

**Reply box.**
- Enter sends; Shift+Enter starts a new line.
- Hover or swipe a message to reply to it.
- A sent message shows at once as "sending". If it fails, it stays with **Try again**.
- After an answer, a line says *"Next: <name>"* when someone else is waiting.

**Errors:**
- Connection lost: a quiet *"Reconnecting…"* line, with automatic retries.
- Logged out elsewhere: *"You were logged out of Telegram."* with **Connect**.
- Telegram asks to slow down: *"Telegram asks you to wait N seconds."*
- A message didn't send: it stays with **Try again**, and nothing is lost.

## Testing

- **Rules (Node, no browser):**
  - `waitingOrder` with controlled times: levels, moving up at 3 h / 12 h / 15 h, answered chats, *No reply needed*, ties, and custom limits.
- **Browser tests with the fake client:**
  - the Home card in every state (waiting, all caught up, unreachable, not connected, locked);
  - the dock badge;
  - choosing levels and Manage chats;
  - opening a chat, reading older messages, replying, reply-to, and a failed send with Try again;
  - each login step and its errors;
  - log out clearing device data;
  - nothing from Telegram while locked.
- **Regression:** all existing tests pass, including `pages-load`, now with the Telegram page.
- **Real account:** the owner connects their own account by hand once it is built.

## Not included

- auto-reply;
- groups and channels;
- notifications while ONE is closed;
- sending photos or files, stickers, voice messages, reactions, editing and deleting;
- a server of any kind.
