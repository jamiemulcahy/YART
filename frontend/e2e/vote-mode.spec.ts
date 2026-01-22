import { test, expect, Page } from "@playwright/test";

/**
 * Helper to set up a room with cards ready for voting
 */
async function setupRoomForVoting(page: Page, roomName: string) {
  // Create room as owner
  await page.goto("/");
  // Switch to Create tab
  await page.getByRole("button", { name: "Create Room" }).first().click();
  await page.getByLabel("Room Name").fill(roomName);
  await page
    .locator("form")
    .getByRole("button", { name: "Create Room" })
    .click();
  // Navigates directly to room (no modal)
  await expect(page).toHaveURL(/\/room\//);

  // Wait for room to load
  await expect(
    page.getByRole("heading", { name: "Configure Columns" })
  ).toBeVisible();

  // Add a column
  await page.getByLabel("New column name").fill("Feedback");
  await page.getByRole("button", { name: "Add Column" }).click();

  // Transition to publish mode
  await page.getByRole("button", { name: "Start Publishing" }).click();
  await expect(
    page.locator(".room-mode-badge").getByText("Add Cards")
  ).toBeVisible();

  // Add cards using draft area
  const draftInput = page.getByPlaceholder("Add a new card...").first();

  await draftInput.fill("First card for voting");
  await page.getByRole("button", { name: "Add Draft" }).first().click();
  await page
    .locator(".draft-card-item")
    .getByRole("button", { name: "Publish" })
    .first()
    .click();

  // Add second card
  await draftInput.fill("Second card for voting");
  await page.getByRole("button", { name: "Add Draft" }).first().click();
  await page
    .locator(".draft-card-item")
    .getByRole("button", { name: "Publish" })
    .first()
    .click();

  // Transition through Group to Vote mode
  await page.getByRole("button", { name: "Start Grouping" }).click();
  await expect(
    page.locator(".room-mode-badge").getByText("Group Cards")
  ).toBeVisible();

  await page.getByRole("button", { name: "Start Voting" }).click();
  await expect(
    page.locator(".room-mode-badge").getByText("Vote")
  ).toBeVisible();
}

test.describe("Vote Mode", () => {
  test("vote mode shows cards one at a time", async ({ page }) => {
    await setupRoomForVoting(page, "Vote Display Test");

    // Should see a swipe card component
    await expect(page.locator(".swipe-card")).toBeVisible();

    // Should show progress indicator (e.g., "0 / 2 cards")
    await expect(page.getByText(/\d+ \/ \d+ cards/)).toBeVisible();
  });

  test("can vote yes using button", async ({ page }) => {
    await setupRoomForVoting(page, "Vote Yes Test");

    // Find and click the "Yes" button
    const yesButton = page.getByRole("button", { name: "Vote Yes" });
    await yesButton.click();

    // Progress should update (now 1 / 2)
    await expect(page.getByText(/1 \/ \d+ cards/)).toBeVisible();
  });

  test("can vote no using button", async ({ page }) => {
    await setupRoomForVoting(page, "Vote No Test");

    // Find and click the "No" button
    const noButton = page.getByRole("button", { name: "Vote No" });
    await noButton.click();

    // Progress should update
    await expect(page.getByText(/1 \/ \d+ cards/)).toBeVisible();
  });

  test("progress updates after each vote", async ({ page }) => {
    await setupRoomForVoting(page, "Vote Progress Test");

    // Should start at 0
    await expect(page.getByText(/0 \/ \d+ cards/)).toBeVisible();

    // Vote on the first card
    await page.getByRole("button", { name: "Vote Yes" }).click();

    // Progress should update to 1
    await expect(page.getByText(/1 \/ \d+ cards/)).toBeVisible();
  });

  test("voting complete shows message", async ({ page }) => {
    await setupRoomForVoting(page, "Vote Complete Test");

    // Vote on all cards (we have 2)
    await page.getByRole("button", { name: "Vote Yes" }).click();
    await page.getByRole("button", { name: "Vote Yes" }).click();

    // Should show voting complete message
    await expect(page.getByText("Voting Complete!")).toBeVisible();
    await expect(page.getByText(/You've voted on all \d+ cards/)).toBeVisible();
  });

  test("owner can transition from vote to focus mode", async ({ page }) => {
    await setupRoomForVoting(page, "Vote to Focus Test");

    // Owner should see the transition button
    const discussButton = page.getByRole("button", {
      name: /start discussion/i,
    });
    await expect(discussButton).toBeVisible();

    // Click to transition
    await discussButton.click();

    // Should be in focus/discuss mode
    await expect(
      page.locator(".room-mode-badge").getByText("Discuss")
    ).toBeVisible();
  });
});
