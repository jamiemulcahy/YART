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

test("shared timer: set, run, pause, edit while paused, alarm for everyone", async ({
  page: owner,
  browser,
}) => {
  const code = await createRoom(owner);
  const alice = await joinRoom(browser, code);
  await expect(alice.getByRole("timer")).toHaveCount(0);

  const setLength = async (value: string) => {
    await owner.getByRole("timer").click();
    // The current value is selected, so typing replaces it rather than appending.
    await owner.keyboard.type(value);
    await owner.keyboard.press("Enter");
  };

  // Digits fill in microwave style (30 = 0:30) with a live preview; m:ss works too.
  await owner.getByRole("timer").click();
  await owner.keyboard.type("30");
  await expect(owner.getByText("= 0:30")).toBeVisible();
  await owner.keyboard.press("Enter");
  await expect(owner.getByRole("timer")).toHaveText("0:30");
  await setLength("2:30");
  await expect(owner.getByRole("timer")).toHaveText("2:30");
  await owner.getByRole("button", { name: "Start timer" }).click();
  await expect(alice.getByRole("timer")).toHaveAttribute("aria-label", /Time left 2:(2\d|30)/);

  // Pause, change the length while paused, and it stays paused at the new length.
  await owner.getByRole("button", { name: "Pause timer" }).click();
  await expect(alice.getByRole("timer")).toHaveAttribute("aria-label", /paused/);
  await setLength("0:45");
  await expect(alice.getByRole("timer")).toHaveAttribute("aria-label", "Time left 0:45, paused");
  await alice.reload();
  await expect(alice.getByRole("timer")).toHaveAttribute("aria-label", "Time left 0:45, paused");
  await owner.getByRole("button", { name: "Resume timer" }).click();
  await expect(alice.getByRole("timer")).toHaveAttribute("aria-label", /Time left 0:4\d$/);

  // Nonsense is refused with a hint and leaves the timer alone; Escape cancels.
  await owner.getByRole("button", { name: "Pause timer" }).click();
  await setLength("banana");
  await expect(owner.getByText("Try 1:30, 45s, or digits like 30 (= 0:30)")).toBeVisible();
  await owner.getByRole("timer").click();
  await owner.keyboard.type("9:00");
  await owner.keyboard.press("Escape");
  await expect(owner.getByRole("timer")).toHaveAttribute("aria-label", /0:4\d, paused/);

  // A 5 second timer runs out: everyone sees "Time's up" and hears the alarm.
  await owner.getByRole("button", { name: "Reset timer" }).click();
  await setLength("00:05");
  await expect(owner.getByRole("timer")).toHaveText("0:05");
  await owner.getByRole("button", { name: "Start timer" }).click();
  await expect(alice.getByRole("timer", { name: "Time's up" })).toBeVisible({ timeout: 15_000 });
  for (const page of [owner, alice]) {
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __yartSounds?: string[] }).__yartSounds ?? []))
      .toContain("alarm");
  }

  await owner.getByRole("button", { name: "Reset timer" }).click();
  await expect(alice.getByRole("timer")).toHaveCount(0);
});

test("drafts stay private in your tray until published", async ({ page: owner, browser }) => {
  const code = await createRoom(owner);
  const alice = await joinRoom(browser, code);
  await nextPhase(owner, "Write");

  const input = alice.getByRole("textbox", { name: "New card in Mad" });
  await input.fill("Draft one");
  await input.press("Enter");
  await input.fill("Draft two");
  await input.press("Enter");
  // Ctrl+Enter drafts too — nothing is ever published straight from the input.
  await input.fill("Draft three");
  await input.press("Control+Enter");
  const tray = alice.getByLabel("Your drafts in Mad");
  await expect(tray.getByRole("article")).toHaveCount(3);
  await tray.getByRole("button", { name: "Delete draft: Draft three" }).click();
  await expect(tray.getByRole("article")).toHaveCount(2);
  await expect(owner.getByText("Draft one")).toHaveCount(0);

  // Drafts survive a refresh.
  await alice.reload();
  await expect(alice.getByLabel("Your drafts in Mad").getByRole("article")).toHaveCount(2);

  // Edit a draft, then publish one, then the rest.
  await alice.getByRole("button", { name: "Draft one", exact: true }).click();
  await alice.getByRole("textbox", { name: "Edit draft" }).fill("Draft one, edited");
  await alice.getByRole("textbox", { name: "Edit draft" }).press("Enter");
  await alice
    .getByRole("article", { name: "Draft: Draft one, edited" })
    .getByRole("button", { name: "Publish" })
    .click();
  await expect(owner.locator(".lane-board").getByText("Draft one, edited")).toBeVisible();
  await expect(owner.getByText("Draft two")).toHaveCount(0);
  await alice.getByRole("button", { name: /Publish all/ }).click();
  await expect(owner.locator(".lane-board").getByText("Draft two")).toBeVisible();
  await expect(alice.getByLabel("Your drafts in Mad").getByRole("article")).toHaveCount(0);
});

test("owner can recolour lanes", async ({ page: owner, browser }) => {
  const code = await createRoom(owner);
  const alice = await joinRoom(browser, code);
  await owner.getByRole("button", { name: "Change colour of Mad" }).click();
  await owner.getByRole("button", { name: "Colour #a855f7" }).click();
  await expect(alice.locator(".lane-header").first()).toHaveCSS("border-top-color", "rgb(168, 85, 247)");
});

test("visible-cards mode and late cards", async ({ page: owner, browser }) => {
  const code = await createRoom(owner);
  const alice = await joinRoom(browser, code);
  await owner.getByRole("button", { name: "⚙ Settings" }).click();
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
  await nextPhase(owner, "Write");
  await addCard(alice, "Glad", "Protect me");
  await addCard(alice, "Mad", "Nobody cares about me");
  await addCard(alice, "Mad", `${"Lorem ipsum dolor sit amet ".repeat(12)}${"x".repeat(150)}`);
  await nextPhase(owner, "Group");
  await nextPhase(owner, "Vote");
  await alice.getByRole("button", { name: "Add a vote to Protect me" }).click();
  await nextPhase(owner, "Discuss");
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
  // One lane at a time; ending during lane 1 (Mad) only gives Mad's topics a fate.
  await expect(alice.locator(".fates li")).toHaveCount(2);
  await expect(alice.locator(".fates")).toContainText("Nobody cares about me");
  // A very long card is truncated on one line rather than stretching the page.
  const overflow = await alice
    .locator(".fates")
    .evaluate((el) => el.scrollWidth - (el.closest(".panel") as HTMLElement).clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(alice.getByText(/topics? survived/)).toBeVisible();
  // The battle doesn't change the results.
  await nextPhase(owner, "Wrap-up");
  await expect(alice.locator(".top-topics li").first()).toHaveText("Protect me · 1 vote");
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
  await page.getByLabel("Room code or invite link").fill("abc");
  await page.getByRole("button", { name: "Join room" }).click();
  await expect(page.getByRole("alert")).toContainText("Room codes are 6 characters");
  await page.getByLabel("Room code or invite link").fill("https://yart.example/r/ZZZ-ZZZ?x=1");
  await page.getByRole("button", { name: "Join room" }).click();
  await expect(page).toHaveURL(/\/r\/ZZZZZZ$/);
});

test("cards show who wrote them, and only authors can remove their cards", async ({
  page: owner,
  browser,
}) => {
  const code = await createRoom(owner);
  const alice = await joinRoom(browser, code);
  const aliceName = await myName(alice);
  await nextPhase(owner, "Write");
  await addCard(alice, "Mad", "Written by Alice");
  await addCard(owner, "Sad", "Written by the owner");

  const aliceCard = owner.getByRole("article").filter({ hasText: "Written by Alice" });
  await expect(aliceCard).toContainText(aliceName);
  // The owner can't remove someone else's card…
  await expect(aliceCard.getByRole("button")).toHaveCount(0);
  // …and sees their own marked as theirs.
  await expect(owner.getByRole("article").filter({ hasText: "Written by the owner" })).toContainText("yours");

  // Names follow renames.
  await alice.locator(".people-btn").click();
  await alice.getByRole("button", { name: /Your name/ }).click();
  await alice.getByRole("textbox", { name: "Your name" }).fill("Alice Again");
  await alice.getByRole("textbox", { name: "Your name" }).press("Enter");
  await expect(aliceCard).toContainText("Alice Again");

  // Names carry through grouping too.
  await nextPhase(owner, "Group");
  await expect(owner.getByRole("article", { name: "Written by Alice" })).toContainText("Alice Again");
});
