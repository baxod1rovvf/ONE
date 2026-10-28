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
  version: 1,
  tasks: [],
  goals: [],
  notes: [],
  saved: [],
  shortcuts: [],
  websiteCategories: [],
  ideas: [],
  ideaCategories: [],
  recent: [],
  settings: { name: "", theme: "light", sidebarCollapsed: false, sampleBannerDismissed: true }
};

async function confirmDelete(page) {
  const dialog = page.getByRole("alertdialog");
  await dialog.waitFor();
  await dialog.getByRole("button", { name: /delete|remove/i }).click();
  await dialog.waitFor({ state: "detached" });
}

test("tasks: add, complete (sprout pops), delete, and it survives reload", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "tasks" });
  await page.getByRole("button", { name: "New task" }).click();
  await page.getByRole("dialog").getByLabel("Task", { exact: true }).fill("Water the plants");
  await page.getByRole("dialog").getByRole("button", { name: "Add task" }).click();
  const row = () => page.locator(".task", { hasText: "Water the plants" });
  await row().first().waitFor();
  await row().getByRole("checkbox").click();
  await row().locator(".sprout").waitFor({ state: "visible" }); // a sprout pops up
  await page.reload();
  await page.getByRole("tab", { name: /Done/ }).click().catch(() => {});
  await row().first().waitFor();
  await row().getByRole("button", { name: 'Actions for "Water the plants"' }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await confirmDelete(page);
  assert.equal(await row().count(), 0);
  assert.deepEqual(errors, []);
  await page.close();
});

async function removeVia(page, menuLabel) {
  await page.getByRole("button", { name: menuLabel }).click();
  await page.getByRole("menuitem", { name: /Delete|Remove/ }).click();
  await confirmDelete(page);
}
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("one.workspace.v1")));

test("websites: add one, it survives reload, remove it", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "websites" });
  await page.locator("main .btn", { hasText: "Add website" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Meadow Club");
  await dialog.getByLabel("Website").fill("https://meadow.example");
  await dialog.getByRole("button", { name: "Add website" }).click();
  await dialog.waitFor({ state: "detached" });
  await page.reload();
  await page.getByText("Meadow Club").first().waitFor();
  await removeVia(page, "Actions for Meadow Club");
  assert.equal(await page.getByText("Meadow Club").count(), 0);
  assert.ok(!(await stored(page)).shortcuts.some((x) => x.name === "Meadow Club"));
  assert.deepEqual(errors, []);
  await page.close();
});

test("ideas: add one, it survives reload, delete it", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "ideas" });
  await page.locator("main .btn", { hasText: "Add idea" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Idea").fill("Picnic under the tree");
  await dialog.getByRole("button", { name: /Add idea|Save/ }).click();
  await dialog.waitFor({ state: "detached" });
  await page.reload();
  const node = page.getByRole("button", { name: "Idea: Picnic under the tree" });
  await node.waitFor();
  await node.click();
  await page.locator(".ideas-side").getByRole("button", { name: "Delete" }).click();
  await confirmDelete(page);
  assert.equal(await node.count(), 0);
  assert.deepEqual(errors, []);
  await page.close();
});

test("saved: add a link, it survives reload, remove it", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "saved" });
  await page.locator("main .btn", { hasText: "Save a link" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("URL").fill("https://grass.example/article");
  await dialog.getByLabel("Title").fill("Why grass is green");
  await dialog.getByRole("button", { name: "Save link" }).click();
  await dialog.waitFor({ state: "detached" });
  await page.reload();
  await page.getByText("Why grass is green").first().waitFor();
  await removeVia(page, 'Actions for "Why grass is green"');
  assert.equal(await page.getByText("Why grass is green").count(), 0);
  assert.deepEqual(errors, []);
  await page.close();
});

test("cards are frosted and rounded, buttons are pills, on every page", async () => {
  for (const route of ["tasks", "websites", "ideas", "saved", "preferences", "goals", "knowledge"]) {
    const { page } = await openApp(browser, server.url, { route });
    const card = page.locator(".panel, .card, .goal, .launch-tile__inner, .igraph").locator("visible=true").first();
    await card.waitFor();
    assert.equal(await card.evaluate((el) => getComputedStyle(el).borderTopLeftRadius), "20px", `card radius on ${route}`);
    assert.match(await card.evaluate((el) => getComputedStyle(el).backdropFilter), /blur/, `frosted card on ${route}`);
    const btn = page.locator("main .btn").first();
    if (await btn.count()) assert.equal(await btn.evaluate((el) => getComputedStyle(el).borderTopLeftRadius), "999px", `pill button on ${route}`);
    await page.close();
  }
});

test("empty pages show friendly art and an action", async () => {
  for (const route of ["tasks", "websites", "ideas", "saved"]) {
    const { page } = await openApp(browser, server.url, { route, data: EMPTY_DATA });
    const empty = page.locator(".empty").first();
    await empty.waitFor();
    assert.ok(await empty.locator("svg.empty-art").isVisible(), `art on ${route}`);
    assert.ok(await empty.getByRole("button").first().isVisible(), `action on ${route}`);
    await page.close();
  }
});
