import { expect, test } from "@playwright/test";
import { addCard, createRoom, joinRoom, myName, nextPhase, toggle } from "./helpers";

test("refreshing keeps your identity, name and cards", async ({ page: owner, browser }) => {
  const code = await createRoom(owner);
  const alice = await joinRoom(browser, code);
  const name = await myName(alice);
  expect(name).toMatch(/^\w+ \w+$/);
  await nextPhase(owner, "Write");
  await addCard(alice, "Glad", "Remember me");

  await alice.reload();
  await expect(alice.locator(".me-name")).toHaveText(name);
  await expect(alice.locator(".card.mine", { hasText: "Remember me" })).toBeVisible();
  // Still one participant from the owner's point of view.
  await expect(owner.locator(".people-count")).toHaveText("👥 2");

  // Renaming sticks across refreshes too.
  await alice.locator(".people-btn").click();
  await alice.getByRole("button", { name: /Your name/ }).click();
  await alice.getByRole("textbox", { name: "Your name" }).fill("Captain Retro");
  await alice.getByRole("textbox", { name: "Your name" }).press("Enter");
  await expect(alice.locator(".me-name")).toHaveText("Captain Retro");
  await alice.reload();
  await expect(alice.locator(".me-name")).toHaveText("Captain Retro");

  // The owner keeps ownership after a refresh.
  await owner.reload();
  await expect(owner.getByText("Facilitator", { exact: true })).toBeVisible();
});

test("owner sets up lanes before the retro starts", async ({ page: owner, browser }) => {
  const code = await createRoom(owner, { template: "Blank" });
  const alice = await joinRoom(browser, code);
  await expect(owner.getByRole("button", { name: "Next: Write →" })).toBeDisabled();

  await owner.getByRole("button", { name: "+ Add lane" }).click();
  await owner.getByRole("button", { name: /Lane 1 title/ }).click();
  await owner.getByRole("textbox", { name: "Lane 1 title" }).fill("Kudos");
  await owner.getByRole("textbox", { name: "Lane 1 title" }).press("Enter");
  await owner.getByRole("button", { name: "Start / Stop / Continue" }).click();
  await expect(alice.locator(".lane-header h3")).toHaveText(["Start", "Stop", "Continue"]);
  await owner.getByRole("button", { name: "Remove Stop" }).click();
  await owner.getByRole("button", { name: "Move Continue up" }).click();
  await expect(alice.locator(".lane-header h3")).toHaveText(["Continue", "Start"]);
  await nextPhase(owner, "Write");
  await expect(alice.getByRole("textbox", { name: "New card in Continue" })).toBeVisible();
});

test("shared timer: owner controls it, everyone sees it", async ({ page: owner, browser }) => {
  const code = await createRoom(owner);
  const alice = await joinRoom(browser, code);
  await expect(alice.getByRole("timer")).toHaveCount(0);

  await owner.getByRole("button", { name: "⏱ Timer" }).click();
  await owner.getByRole("button", { name: "2 min" }).click();
  await owner.getByRole("button", { name: "Start timer" }).click();
  await expect(alice.getByRole("timer")).toHaveAttribute("aria-label", /Time left 1:5\d|Time left 2:00/);

  await owner.getByRole("button", { name: "Pause" }).click();
  await expect(alice.getByRole("timer")).toHaveAttribute("aria-label", /paused/);
  await alice.reload();
  await expect(alice.getByRole("timer")).toHaveAttribute("aria-label", /paused/);

  await owner.getByRole("button", { name: "Resume" }).click();
  await expect(alice.getByRole("timer")).not.toHaveAttribute("aria-label", /paused/);

  // A short custom timer runs out and shows "Time's up" for everyone.
  await owner.getByLabel("Custom (min)").fill("0.2");
  await owner.getByLabel("Custom (min)").press("Enter");
  await owner.getByRole("button", { name: "Start timer" }).click();
  await expect(alice.getByRole("timer", { name: "Time's up" })).toBeVisible({ timeout: 20_000 });

  await owner.getByRole("button", { name: "Stop & hide" }).click();
  await expect(alice.getByRole("timer")).toHaveCount(0);
});

test("visible-cards mode and late cards", async ({ page: owner, browser }) => {
  const code = await createRoom(owner);
  const alice = await joinRoom(browser, code);
  await owner.getByRole("button", { name: "⚙ Settings" }).click();
  await toggle(owner, "Hide card text until revealed", false);
  await toggle(owner, "Allow adding cards while grouping", true);
  await nextPhase(owner, "Write");
  await addCard(owner, "Mad", "Everyone sees this immediately");
  await expect(alice.getByText("Everyone sees this immediately")).toBeVisible();

  await nextPhase(owner, "Group");
  await alice.getByText("Forgot something? Add a late card").click();
  await addCard(alice, "Sad", "A late thought");
  await expect(owner.locator(".card-text", { hasText: "A late thought" })).toBeVisible();
});

test("drag a card onto another to group, then ungroup", async ({ page: owner, browser }) => {
  const code = await createRoom(owner);
  const alice = await joinRoom(browser, code);
  await owner.getByRole("button", { name: "⚙ Settings" }).click();
  await toggle(owner, "Hide card text until revealed", false);
  await nextPhase(owner, "Write");
  await addCard(owner, "Mad", "Standups run long");
  await addCard(alice, "Sad", "Too many meetings");
  await nextPhase(owner, "Group");

  const source = alice.getByRole("article", { name: "Too many meetings" });
  const target = alice.getByRole("article", { name: "Standups run long" });
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("cards not on screen");
  await alice.mouse.move(from.x + 40, from.y + 15);
  await alice.mouse.down();
  await alice.mouse.move(from.x + 60, from.y + 30, { steps: 5 });
  await alice.mouse.move(to.x + 40, to.y + 15, { steps: 15 });
  await alice.mouse.up();

  const group = owner.getByRole("group", { name: /Group: Standups run long/ });
  await expect(group.locator(".card")).toHaveCount(2);
  await owner.getByRole("button", { name: "Ungroup" }).click();
  await expect(alice.getByRole("group")).toHaveCount(0);

  // Locking stops everyone else from regrouping.
  await owner.getByRole("button", { name: "Lock grouping" }).click();
  await expect(alice.getByText("Grouping is locked by the facilitator.")).toBeVisible();
  await expect(alice.getByRole("combobox", { name: /Move card/ })).toHaveCount(0);
});

test("battle launches for everyone and reports results", async ({ page: owner, browser }) => {
  const code = await createRoom(owner);
  const alice = await joinRoom(browser, code);
  await owner.getByRole("button", { name: "⚙ Settings" }).click();
  await toggle(owner, "Hide card text until revealed", false);
  await nextPhase(owner, "Write");
  await addCard(alice, "Glad", "Protect me");
  await addCard(alice, "Mad", "Nobody cares about me");
  await nextPhase(owner, "Group");
  await nextPhase(owner, "Defend");
  await alice.getByRole("button", { name: "Add a shield to Protect me" }).click();
  await nextPhase(owner, "Battle");
  await expect(alice.getByText("Invaders incoming!")).toBeVisible();
  await expect(alice.getByText("Waiting for the facilitator to launch…")).toBeVisible();

  await owner.getByRole("button", { name: "Launch battle!" }).first().click();
  await expect(alice.getByRole("img", { name: /Battle arena/ })).toBeVisible();
  await expect(owner.getByRole("img", { name: /Battle arena/ })).toBeVisible();

  // Fire a few shots so the input path is exercised.
  await alice.waitForTimeout(4000);
  const arena = alice.getByRole("img", { name: /Battle arena/ });
  await arena.hover();
  await alice.keyboard.down(" ");
  await alice.waitForTimeout(1500);
  await alice.keyboard.up(" ");

  await owner.getByRole("button", { name: "End battle now" }).click();
  await expect(alice.locator(".fates li")).toHaveCount(2);
  await expect(alice.getByText(/topics? survived/)).toBeVisible();
  // The battle doesn't change discussion order.
  await nextPhase(owner, "Discuss");
  await expect(alice.locator(".topic-rank li").first()).toContainText("Protect me");
});

test("owner can delete the room", async ({ page: owner, browser }) => {
  const code = await createRoom(owner);
  const alice = await joinRoom(browser, code);
  await owner.getByRole("button", { name: "⚙ Settings" }).click();
  await owner.getByRole("button", { name: "Delete room…" }).click();
  await owner.getByRole("button", { name: "Yes, delete room" }).click();
  await expect(alice.getByText("This room has been deleted")).toBeVisible();
  await alice.goto(`/r/${code}`);
  await expect(alice.getByText("Room not found")).toBeVisible();
});

test("unknown room shows a friendly message", async ({ page }) => {
  await page.goto("/r/ZZZZZZ");
  await expect(page.getByRole("heading", { name: "Room not found" })).toBeVisible();
  await page.goto("/");
  await page.getByLabel("Room code").fill("abc");
  await page.getByRole("button", { name: "Join room" }).click();
  await expect(page.getByRole("alert")).toContainText("Room codes are 6 characters");
});
