const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, launch, openApp, addAlbum } = require("./helpers.cjs");

let server, browser;
before(async () => {
  server = await startServer();
  browser = await launch();
});
after(async () => {
  await browser.close();
  await server.close();
});

const panel = (page) => page.getByRole("dialog", { name: "Sounds" });
const soundsButton = (page) => page.getByRole("toolbar", { name: "Quick actions" }).getByRole("button", { name: "Sounds" });

test("focus stays inside the panel; Esc closes it and returns focus to Sounds", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await soundsButton(page).click();
  await panel(page).waitFor();
  assert.equal(await page.evaluate(() => !!document.activeElement.closest("[role=dialog]")), true, "focus moves into the panel");
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press(i % 3 ? "Tab" : "Shift+Tab");
    assert.equal(await page.evaluate(() => !!document.activeElement.closest("[role=dialog][aria-label=Sounds]")), true, `focus left the panel after ${i + 1} presses`);
  }
  await page.keyboard.press("Escape");
  await panel(page).waitFor({ state: "detached" });
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute("aria-label")), "Sounds");
  await page.close();
});

test("on a phone the panel sits at the bottom and nothing scrolls sideways", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks", viewport: { width: 375, height: 812 } });
  await soundsButton(page).click();
  for (const tab of ["Nature", "Music", "Quran"]) {
    await panel(page).getByRole("tab", { name: tab }).click();
    const box = await panel(page).boundingBox();
    assert.ok(box.y + box.height > 812 - 140, `${tab}: bottom at ${box.y + box.height}`);
    assert.ok(box.x >= 0 && box.x + box.width <= 375, `${tab}: inside the screen`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 375, `${tab}: no sideways scroll`);
  }
  await page.close();
});

test("with reduced motion the playing bars stand still", async () => {
  const b = await launch({ reducedMotion: true });
  try {
    const { page } = await openApp(b, server.url, { route: "tasks" });
    await soundsButton(page).click();
    await panel(page).getByRole("switch", { name: "Rain", exact: true }).click();
    await page.waitForSelector("[aria-label='Sounds'][data-playing='true']");
    const anim = await soundsButton(page).locator(".sound-bars rect").first().evaluate((el) => getComputedStyle(el).animationName);
    assert.equal(anim, "none");
  } finally {
    await b.close();
  }
});

test("while the panel is open, C and Ctrl+K don't open other dialogs", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await soundsButton(page).click();
  await panel(page).getByRole("tab", { name: "Nature" }).focus();
  await page.keyboard.press("c");
  await page.keyboard.press("Control+K");
  await page.waitForTimeout(200);
  assert.equal(await page.getByRole("dialog").count(), 1);
  await page.close();
});

test("playback ticks don't re-render the Quran list", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  // React reports each update to the developer-tools hook; this stand-in hook
  // counts the updates in which the Quran tab component re-rendered.
  await page.addInitScript(() => {
    window.__quranRenders = 0;
    // Each render of a component gets a fresh props object; a skipped one keeps it.
    const seen = new WeakSet();
    const visit = (fiber) => {
      for (let f = fiber; f; f = f.sibling) {
        if (f.type && f.type.name === "QuranTab" && !seen.has(f.memoizedProps)) {
          seen.add(f.memoizedProps);
          window.__quranRenders++;
        }
        if (f.child) visit(f.child);
      }
    };
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true,
      renderers: new Map(),
      inject: () => 1,
      checkDCE: () => {},
      onScheduleFiberRoot: () => {},
      onCommitFiberRoot: (id, root) => visit(root.current),
      onPostCommitFiberRoot: () => {},
      onCommitFiberUnmount: () => {}
    };
  });
  await page.reload();
  await page.mouse.click(2, 2);
  await soundsButton(page).click();
  await panel(page).getByRole("tab", { name: "Music" }).click();
  await addAlbum(page, "Test", ["long.mp3"]);
  await panel(page).getByRole("button", { name: "Play Long Song" }).click();
  await page.waitForFunction(() => window.__oneSound.stats().track && window.__oneSound.stats().track.playing);
  await panel(page).getByRole("tab", { name: "Quran" }).click();
  await page.waitForTimeout(800);
  const before = await page.evaluate(() => window.__quranRenders);
  const p0 = (await page.evaluate(() => window.__oneSound.stats().track.position));
  await page.waitForTimeout(2500);
  const p1 = (await page.evaluate(() => window.__oneSound.stats().track.position));
  assert.ok(p1 - p0 > 1.5, "music kept playing");
  const renders = (await page.evaluate(() => window.__quranRenders)) - before;
  assert.ok(renders <= 1, `Quran tab re-rendered ${renders} times in 2.5 s of playback`);
  await page.close();
});
