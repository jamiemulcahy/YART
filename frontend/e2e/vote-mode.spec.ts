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
  test("vote mode shows all cards organized by column", async ({ page }) => {
    await setupRoomForVoting(page, "Vote Display Test");

    // Should see cards in the column layout
    await expect(page.locator(".vote-card")).toHaveCount(2);

    // Should see the instruction text
    await expect(
      page.getByText(/Click on cards or groups to vote/)
    ).toBeVisible();

    // Should show unlimited voting by default
    await expect(page.getByText("Unlimited voting")).toBeVisible();
  });

  test("can vote on a card by clicking", async ({ page }) => {
    await setupRoomForVoting(page, "Vote Click Test");

    // Find the first vote card
    const firstCard = page
      .getByRole("button", { name: "Vote for card" })
      .first();
    await expect(firstCard).toBeVisible();

    // Click to vote
    await firstCard.click();

    // Card should now show "Voted" state
    await expect(
      page.getByRole("button", { name: "Remove vote from card" }).first()
    ).toBeVisible();
  });

  test("can toggle vote off by clicking again", async ({ page }) => {
    await setupRoomForVoting(page, "Vote Toggle Test");

    // Vote on first card
    const firstCard = page
      .getByRole("button", { name: "Vote for card" })
      .first();
    await firstCard.click();

    // Should show voted state
    const votedCard = page
      .getByRole("button", { name: "Remove vote from card" })
      .first();
    await expect(votedCard).toBeVisible();

    // Click again to remove vote
    await votedCard.click();

    // Should be back to unvoted state
    await expect(
      page.getByRole("button", { name: "Vote for card" }).first()
    ).toBeVisible();
  });

  test("vote count updates after voting", async ({ page }) => {
    await setupRoomForVoting(page, "Vote Count Test");

    // Initially should show 0 votes
    await expect(page.getByText("0 votes").first()).toBeVisible();

    // Vote on the first card
    await page.getByRole("button", { name: "Vote for card" }).first().click();

    // Should now show 1 vote
    await expect(page.getByText("1 vote").first()).toBeVisible();
  });

  test("can vote on multiple cards", async ({ page }) => {
    await setupRoomForVoting(page, "Multi Vote Test");

    // Vote on both cards - need to wait for the first vote to register before clicking second
    const voteButtons = page.getByRole("button", { name: "Vote for card" });
    await expect(voteButtons).toHaveCount(2);

    await voteButtons.first().click();
    // Wait for the voted state to appear before clicking the next card
    await expect(
      page.getByRole("button", { name: "Remove vote from card" })
    ).toHaveCount(1);

    // Now click the remaining unvoted card
    await page.getByRole("button", { name: "Vote for card" }).click();

    // Both cards should show voted state
    await expect(
      page.getByRole("button", { name: "Remove vote from card" })
    ).toHaveCount(2);
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

  test("owner can access vote settings", async ({ page }) => {
    await setupRoomForVoting(page, "Vote Settings Test");

    // Owner should see the settings button
    const settingsButton = page.getByRole("button", { name: "Vote settings" });
    await expect(settingsButton).toBeVisible();

    // Click to open settings modal
    await settingsButton.click();

    // Should see the settings modal
    await expect(
      page.getByRole("heading", { name: "Vote Settings", exact: true })
    ).toBeVisible();
    await expect(page.getByLabel(/Total votes per person/i)).toBeVisible();
    await expect(page.getByLabel(/Votes per column per person/i)).toBeVisible();
  });

  test("vote limits are enforced", async ({ page }) => {
    await setupRoomForVoting(page, "Vote Limit Test");

    // Open settings and set a limit of 1 vote
    await page.getByRole("button", { name: "Vote settings" }).click();
    await page.getByLabel(/Total votes per person/i).fill("1");
    await page.getByRole("button", { name: "Save" }).click();

    // Should show the limit
    await expect(page.getByText("Total votes: 0 / 1")).toBeVisible();

    // Vote on first card
    await page.getByRole("button", { name: "Vote for card" }).first().click();

    // Should show 1 / 1 used
    await expect(page.getByText("Total votes: 1 / 1")).toBeVisible();

    // Try to vote on second card - should be silently rejected (limit reached)
    await page.getByRole("button", { name: "Vote for card" }).first().click();

    // Still should show 1 / 1 (vote was rejected)
    await expect(page.getByText("Total votes: 1 / 1")).toBeVisible();
  });

  test("cards show author information", async ({ page }) => {
    await setupRoomForVoting(page, "Vote Author Test");

    // Cards should show author (the user who created them)
    await expect(page.locator(".vote-card-author").first()).toBeVisible();
  });

  test("column header shows card count", async ({ page }) => {
    await setupRoomForVoting(page, "Vote Column Count Test");

    // Column should show count of 2 (we added 2 cards)
    await expect(page.getByText("2").first()).toBeVisible();
  });
});
