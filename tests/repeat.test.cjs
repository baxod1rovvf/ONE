const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, launch, openApp } = require("./helpers.cjs");

let server, browser;
before(async () => {
  server = await startServer();
  browser = await launch();
});
after(async () => {
  await browser.close();
  await server.close();
});

const EMPTY_DATA = {
  version: 1, tasks: [], goals: [], notes: [], saved: [], shortcuts: [], websiteCategories: [],
  ideas: [], ideaCategories: [], recent: [],
  settings: { name: "", theme: "light", sidebarCollapsed: false, sampleBannerDismissed: true }
};
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("one.workspace.v1")));

test("the next date of a repeating task", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "tasks", data: EMPTY_DATA });
  const next = (task, today) => page.evaluate(([t, d]) => window.__oneApp.nextRepeatDate(t, d), [task, today]);
  // 2026-11-06 is a Friday.
  assert.equal(await next({ repeat: "daily", dueDate: "2026-11-06" }, "2026-11-06"), "2026-11-07");
  assert.equal(await next({ repeat: "daily", dueDate: "2026-11-02" }, "2026-11-06"), "2026-11-07", "overdue: from tomorrow on");
  assert.equal(await next({ repeat: "weekly", dueDate: "2026-11-03" }, "2026-11-06"), "2026-11-10", "overdue weekly keeps its weekday");
  assert.equal(await next({ repeat: "weekdays", dueDate: "2026-11-06" }, "2026-11-06"), "2026-11-09", "Friday to Monday");
  assert.equal(await next({ repeat: "monthly", dueDate: "2027-01-31" }, "2027-01-31"), "2027-02-28", "short month ends early");
  assert.equal(await next({ repeat: "monthly", dueDate: "2026-12-15" }, "2026-12-15"), "2027-01-15", "into the new year");
  assert.equal(await next({ repeat: "daily", dueDate: null }, "2026-11-06"), "2026-11-07", "no date counts from today");
  assert.equal(await next({ repeat: null, dueDate: "2026-11-06" }, "2026-11-06"), null);
  assert.deepEqual(errors, []);
  await page.close();
});

test("ticking off a weekly task adds next week's; unticking takes it back", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "tasks", data: EMPTY_DATA });
  await page.getByRole("button", { name: "New task" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await page.waitForFunction(() => document.activeElement && document.activeElement.closest("[role=dialog]"));
  await dialog.getByLabel("Task", { exact: true }).fill("Water the plants");
  await dialog.getByRole("button", { name: "Today" }).click();
  await dialog.getByRole("button", { name: "Every week" }).click();
  await dialog.getByRole("button", { name: "Add task" }).click();
  await dialog.waitFor({ state: "detached" });

  const row = page.locator(".task", { hasText: "Water the plants" });
  await row.locator(".task__repeat", { hasText: "Weekly" }).waitFor();
  await row.getByRole("checkbox").click();
  await page.getByText(/^Next one:/).waitFor();

  const today = await page.evaluate(() => window.__oneApp.todayISO());
  const inAWeek = await page.evaluate((d) => window.__oneApp.addDays(d, 7), today);
  let tasks = (await stored(page)).tasks;
  assert.equal(tasks.length, 2);
  const done = tasks.find((t) => t.done);
  const next = tasks.find((t) => !t.done);
  assert.equal(next.dueDate, inAWeek);
  assert.equal(next.repeat, "weekly");
  assert.equal(done.repeatNextId, next.id);

  await page.getByRole("group", { name: "Task view" }).getByRole("button", { name: /Upcoming/ }).click();
  await page.locator(".task", { hasText: "Water the plants" }).waitFor();

  await page.getByRole("group", { name: "Task view" }).getByRole("button", { name: /Today/ }).click();
  await page.locator(".task--done", { hasText: "Water the plants" }).getByRole("checkbox").click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("one.workspace.v1")).tasks.length === 1);
  tasks = (await stored(page)).tasks;
  assert.equal(tasks[0].done, false);
  assert.equal(tasks[0].dueDate, today);
  assert.deepEqual(errors, []);
  await page.close();
});

test("a repeating task with no date starts today", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "tasks", data: EMPTY_DATA });
  await page.getByRole("group", { name: "Task view" }).getByRole("button", { name: /Anytime/ }).click();
  await page.getByRole("button", { name: "New task" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await page.waitForFunction(() => document.activeElement && document.activeElement.closest("[role=dialog]"));
  await dialog.getByLabel("Task", { exact: true }).fill("Stretch");
  await dialog.getByRole("button", { name: "Every day" }).click();
  await dialog.getByText("Starts today.", { exact: false }).waitFor();
  await dialog.getByRole("button", { name: "Add task" }).click();
  await dialog.waitFor({ state: "detached" });
  const today = await page.evaluate(() => window.__oneApp.todayISO());
  const [task] = (await stored(page)).tasks;
  assert.equal(task.dueDate, today);
  assert.equal(task.repeat, "daily");
  assert.deepEqual(errors, []);
  await page.close();
});
