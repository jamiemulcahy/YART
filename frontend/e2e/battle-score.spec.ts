import { expect, test } from "@playwright/test";
import { addCard, createRoom, joinRoom, nextPhase } from "./helpers";

test("the team gets a graded score after a battle, shown in results, wrap-up and export", async ({
  page: owner,
  browser,
}) => {
  test.setTimeout(90_000);
  const code = await createRoom(owner, { name: "Score retro" });
  const alice = await joinRoom(browser, code);
  await nextPhase(owner, "Write");
  await addCard(alice, "Mad", "Builds are slow");
  await addCard(owner, "Sad", "Too many meetings");
  await nextPhase(owner, "Group");
  await nextPhase(owner, "Vote");
  await nextPhase(owner, "Discuss");
  await nextPhase(owner, "Battle");

  // Ended during the countdown, no lane was fought: no score.
  await owner.getByRole("button", { name: "Launch battle!" }).first().click();
  await expect(owner.getByRole("img", { name: /Battle arena/ })).toBeVisible();
  await owner.getByRole("button", { name: "End battle now" }).click();
  await expect(alice.getByText("Battle called off")).toBeVisible();
  await expect(alice.getByRole("region", { name: "Team score" })).toHaveCount(0);

  // The score doesn't depend on the leaderboard being shown.
  await owner.getByRole("button", { name: "⚙ Settings" }).click();
  await owner.getByText("Show battle leaderboard").click();
  await owner.getByRole("button", { name: "⚙ Settings" }).click();

  await owner.getByRole("button", { name: "Play again" }).click();
  const arena = alice.getByRole("img", { name: /Battle arena/ });
  await expect(arena).toBeVisible();
  await alice.waitForTimeout(4500);
  await arena.focus();
  await alice.keyboard.down(" ");
  await alice.waitForTimeout(2500);
  await alice.keyboard.up(" ");
  await owner.getByRole("button", { name: "End battle now" }).click();

  // Ending during the first lane: one topic fought, only enemies that showed up count.
  const score = alice.getByRole("region", { name: "Team score" });
  await expect(score).toBeVisible();
  await expect(score.getByLabel(/^Grade [SABCD]$/)).toBeVisible();
  await expect(score).toContainText(/\d+ \/ 100/);
  await expect(score).toContainText(/Topics saved\s*[01] of 1/);
  await expect(score).toContainText(/Enemy health destroyed\s*\d+%/);
  await expect(score).toContainText(/Drones destroyed\s*\d+ of \d+/);
  await expect(alice.getByRole("heading", { name: "Top guns" })).toHaveCount(0);
  const grade = (await score.getByLabel(/^Grade /).getAttribute("aria-label"))!.slice(-1);
  const points = (await score.locator(".score-number strong").textContent())!;

  // Everyone sees the same score, and it survives a refresh.
  await expect(owner.getByRole("region", { name: "Team score" }).getByLabel(`Grade ${grade}`)).toBeVisible();
  await alice.reload();
  await expect(alice.getByRole("region", { name: "Team score" }).getByLabel(`Grade ${grade}`)).toBeVisible();

  await nextPhase(owner, "Wrap-up");
  await expect(alice.getByText(`Battle grade ${grade} (${points}/100)`)).toBeVisible();
  await expect(alice.getByLabel("Markdown export")).toContainText(
    new RegExp(
      `Battle: Grade ${grade} — ${points}/100 · [01] of 1 topics saved · \\d+% enemy health destroyed`
    )
  );
});
