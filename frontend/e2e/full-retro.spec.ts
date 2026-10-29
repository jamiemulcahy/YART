import { expect, test } from "@playwright/test";
import { addCard, createRoom, expectPhase, joinRoom, nextPhase } from "./helpers";

test("a whole retro: write, reveal, group, defend, discuss, export", async ({ page: owner, browser }) => {
  const code = await createRoom(owner, { name: "Sprint 42" });
  const alice = await joinRoom(browser, code);
  const bob = await joinRoom(browser, code);

  // Everyone shows up in the lobby.
  await expect(owner.locator(".lobby-list li")).toHaveCount(3);

  await nextPhase(owner, "Write");
  await expectPhase(alice, "Write");

  await addCard(alice, "Mad", "Deploys take forever");
  await addCard(bob, "Mad", "CI pipeline is so slow");
  await addCard(bob, "Glad", "Great pairing sessions");
  await addCard(owner, "Sad", "Missed the sprint goal");

  // Cards are hidden from everyone but their author until revealed.
  await expect(alice.locator(".card.face-down")).toHaveCount(3);
  await expect(alice.getByText("CI pipeline is so slow")).toHaveCount(0);

  await owner.getByRole("button", { name: "Reveal cards" }).click();
  await expect(alice.getByText("CI pipeline is so slow")).toBeVisible();
  await expect(alice.locator(".card.face-down")).toHaveCount(0);

  // Group the two deploy-speed cards via the card menu.
  await nextPhase(owner, "Group");
  await expectPhase(bob, "Group");
  await bob.getByRole("combobox", { name: "Move card: CI pipeline is so slow" }).selectOption({
    label: "Deploys take forever",
  });
  const group = owner.getByRole("group", { name: /Group: Deploys take forever/ });
  await expect(group).toBeVisible();
  await expect(group.locator(".card")).toHaveCount(2);

  // Anyone can name the group.
  await alice.getByRole("button", { name: /Group name/ }).click();
  await alice.getByRole("textbox", { name: "Group name" }).fill("Slow delivery");
  await alice.getByRole("textbox", { name: "Group name" }).press("Enter");
  await expect(owner.getByRole("group", { name: "Group: Slow delivery" })).toBeVisible();

  // Defend: shields are votes.
  await nextPhase(owner, "Defend");
  await expect(alice.getByText("5 of 5 shields left")).toBeVisible();
  await alice.getByRole("button", { name: "Add a shield to Slow delivery" }).click();
  await alice.getByRole("button", { name: "Add a shield to Slow delivery" }).click();
  await expect(alice.getByText("3 of 5 shields left")).toBeVisible();
  await bob.getByRole("button", { name: "Add a shield to Slow delivery" }).click();
  await bob.getByRole("button", { name: "Add a shield to Missed the sprint goal" }).click();

  // Totals hidden from participants by default; the owner sees them.
  await expect(alice.getByText("Totals hidden").first()).toBeVisible();
  await expect(
    owner.getByRole("article", { name: /Slow delivery\. 0 of your shields, 3 total/ })
  ).toBeVisible();

  // Skip the battle straight to discussion.
  await owner.getByRole("button", { name: "Skip battle → Discuss" }).click();
  await expectPhase(alice, "Discuss");

  // Ranked by shields: Slow delivery (3) first.
  await expect(alice.locator(".topic-rank li").first()).toContainText("Slow delivery");
  await owner.getByRole("button", { name: "Open top topic →" }).click();
  await expect(alice.getByRole("article", { name: "Open topic: Slow delivery" })).toBeVisible();
  await expect(bob.getByRole("article", { name: "Open topic: Slow delivery" })).toBeVisible();

  await alice.getByRole("textbox", { name: "Add a note" }).fill("Most time is in the e2e stage");
  await alice.getByRole("button", { name: "Add", exact: true }).click();
  await expect(bob.getByText("Most time is in the e2e stage")).toBeVisible();

  await bob.getByRole("textbox", { name: "New action" }).first().fill("Shard the e2e suite");
  await bob.getByRole("textbox", { name: "Who owns it (optional)" }).first().fill("Sam");
  await bob.getByRole("button", { name: "Add action" }).first().click();
  await expect(owner.getByText("Shard the e2e suite")).toBeVisible();

  await owner.getByRole("button", { name: "Mark discussed" }).click();
  await owner.getByRole("button", { name: "Next topic →" }).click();
  await expect(alice.getByRole("article", { name: "Open topic: Missed the sprint goal" })).toBeVisible();

  // Wrap-up export contains everything.
  await nextPhase(owner, "Wrap-up");
  const md = alice.getByLabel("Markdown export");
  await expect(md).toContainText("# Sprint 42");
  await expect(md).toContainText("### 1. Slow delivery — 🛡 3");
  await expect(md).toContainText("_Group of 2 · Mad_");
  await expect(md).toContainText("- Most time is in the e2e stage");
  await expect(md).toContainText("- [ ] Shard the e2e suite — Sam");
  await expect(md).toContainText("Great pairing sessions");
});

test("back navigation and a viewer screen", async ({ page: owner, browser }) => {
  const code = await createRoom(owner);
  const viewer = await joinRoom(browser, code, { viewer: true });
  await nextPhase(owner, "Write");
  await expectPhase(viewer, "Write");
  await expect(viewer.getByRole("textbox", { name: /New card in/ })).toHaveCount(0);

  await addCard(owner, "Mad", "Visible to the TV after reveal");
  await nextPhase(owner, "Group");
  await expect(viewer.getByText("Visible to the TV after reveal")).toBeVisible();

  await owner.getByRole("button", { name: "← Back to Write" }).click();
  await expectPhase(viewer, "Write");
  // Viewers don't count as participants.
  await expect(owner.locator(".people-count")).toHaveText("👥 1");
});
