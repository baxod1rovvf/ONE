// ONE — Telegram page. It loads into the same page as index.html (see
// loadPage there). The live connection and chats come from
// pages/telegram/service.js through useTelegram.
(function () {
  "use strict";
  const { React2 } = window.__oneApp;
  function TelegramPage() {
    return React2.createElement("div", { className: "page-head" }, React2.createElement("h1", { className: "page-title" }, "Telegram"));
  }
  window.__onePages = window.__onePages || {};
  window.__onePages.telegram = TelegramPage;
})();
