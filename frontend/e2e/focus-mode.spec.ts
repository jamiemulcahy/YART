import { test, expect, Page } from "@playwright/test";

/**
 * Helper to set up a room ready for focus mode
 */
async function setupRoomForFocus(page: Page, roomName: string) {
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
  await page.getByLabel("New column name").fill("Discussion Items");
  await page.getByRole("button", { name: "Add Column" }).click();

  // Transition to publish mode
  await page.getByRole("button", { name: "Start Publishing" }).click();
  await expect(
    page.locator(".room-mode-badge").getByText("Add Cards")
  ).toBeVisible();

  // Add cards
  const draftInput = page.getByPlaceholder("Add a new card...").first();

  await draftInput.fill("Topic A for discussion");
  await page.getByRole("button", { name: "Add Draft" }).first().click();
  await page
    .locator(".draft-card-item")
    .getByRole("button", { name: "Publish" })
    .first()
    .click();

  await draftInput.fill("Topic B for discussion");
  await page.getByRole("button", { name: "Add Draft" }).first().click();
  await page
    .locator(".draft-card-item")
    .getByRole("button", { name: "Publish" })
    .first()
    .click();

  await draftInput.fill("Topic C for discussion");
  await page.getByRole("button", { name: "Add Draft" }).first().click();
  await page
    .locator(".draft-card-item")
    .getByRole("button", { name: "Publish" })
    .first()
    .click();

  // Transition through Group and Vote to Focus mode
  await page.getByRole("button", { name: "Start Grouping" }).click();
  await expect(
    page.locator(".room-mode-badge").getByText("Group Cards")
  ).toBeVisible();

  await page.getByRole("button", { name: "Start Voting" }).click();
  await expect(
    page.locator(".room-mode-badge").getByText("Vote")
  ).toBeVisible();

  await page.getByRole("button", { name: /start discussion/i }).click();
  await expect(
    page.locator(".room-mode-badge").getByText("Discuss")
  ).toBeVisible();
}

test.describe("Focus Mode", () => {
  test("focus mode displays column view with cards", async ({ page }) => {
    await setupRoomForFocus(page, "Focus Column View Test");

    // Should show the column layout
    await expect(page.locator(".columns-container")).toBeVisible();

    // Should show the Discussion Items column
    await expect(
      page.getByRole("heading", { name: "Discussion Items" })
    ).toBeVisible();

    // Should show cards in the column view
    await expect(page.locator(".focus-item")).toHaveCount(3);

    // Cards should be visible with their content
    await expect(page.getByText("Topic A for discussion")).toBeVisible();
    await expect(page.getByText("Topic B for discussion")).toBeVisible();
    await expect(page.getByText("Topic C for discussion")).toBeVisible();
  });

  test("focus mode shows vote badges on cards", async ({ page }) => {
    await setupRoomForFocus(page, "Focus Votes Display Test");

    // Each card should have a vote badge
    const voteBadges = page.locator(".focus-item-votes");
    await expect(voteBadges).toHaveCount(3);

    // Vote badges should show vote count (0 initially)
    await expect(voteBadges.first()).toHaveText("0");
  });

  test("owner can click card to open discussion modal", async ({ page }) => {
    await setupRoomForFocus(page, "Focus Modal Test");

    // Click on the first card
    const firstCard = page.locator(".focus-item").first();
    await firstCard.click();

    // Modal should appear
    await expect(page.locator(".focus-modal-overlay")).toBeVisible();
    await expect(page.locator(".focus-modal")).toBeVisible();

    // Modal should show the column name
    await expect(page.locator(".focus-modal-column")).toHaveText(
      "Discussion Items"
    );

    // Modal should show the card content
    await expect(page.locator(".focus-modal-card-text").first()).toBeVisible();
  });

  test("owner can close discussion modal", async ({ page }) => {
    await setupRoomForFocus(page, "Focus Modal Close Test");

    // Click on a card to open modal
    await page.locator(".focus-item").first().click();
    await expect(page.locator(".focus-modal")).toBeVisible();

    // Click close button
    await page.getByRole("button", { name: "Close" }).click();

    // Modal should disappear
    await expect(page.locator(".focus-modal")).not.toBeVisible();
  });

  test("owner can add action items in modal", async ({ page }) => {
    await setupRoomForFocus(page, "Action Items Test");

    // Open modal for a card
    await page.locator(".focus-item").first().click();
    await expect(page.locator(".focus-modal")).toBeVisible();

    // Should show empty state initially
    await expect(page.getByText("No action items yet.")).toBeVisible();

    // Find action item input
    const actionInput = page.getByPlaceholder("Add an action item...");
    await expect(actionInput).toBeVisible();

    // Add an action item
    await actionInput.fill("Follow up with team about this");
    await page.getByRole("button", { name: "Add" }).click();

    // Action item should appear in the list
    await expect(
      page.getByText("Follow up with team about this")
    ).toBeVisible();

    // Empty state should be gone
    await expect(page.getByText("No action items yet.")).not.toBeVisible();
  });

  test("can add multiple action items", async ({ page }) => {
    await setupRoomForFocus(page, "Multiple Actions Test");

    // Open modal
    await page.locator(".focus-item").first().click();

    // Add first action item
    const actionInput = page.getByPlaceholder("Add an action item...");
    await actionInput.fill("First action item");
    await page.getByRole("button", { name: "Add" }).click();

    // Add second action item
    await actionInput.fill("Second action item");
    await page.getByRole("button", { name: "Add" }).click();

    // Both should appear
    await expect(page.getByText("First action item")).toBeVisible();
    await expect(page.getByText("Second action item")).toBeVisible();

    // Action items list should have 2 items
    await expect(page.locator(".action-items-list li")).toHaveCount(2);
  });

  test("focus mode shows instruction text for owner", async ({ page }) => {
    await setupRoomForFocus(page, "Focus Instructions Test");

    // Owner should see click instruction
    await expect(
      page.getByText("Click on a card or group to start discussing it.")
    ).toBeVisible();
  });

  test("cards are clickable for owner", async ({ page }) => {
    await setupRoomForFocus(page, "Cards Clickable Test");

    // Cards should have clickable styling
    const focusItems = page.locator(".focus-item.clickable");
    await expect(focusItems).toHaveCount(3);
  });

  test("owner can transition from focus to overview mode", async ({ page }) => {
    await setupRoomForFocus(page, "Focus to Overview Test");

    // Owner should see the transition button
    const summaryButton = page.getByRole("button", { name: /view summary/i });
    await expect(summaryButton).toBeVisible();

    // Click to transition
    await summaryButton.click();

    // Should be in overview mode
    await expect(
      page.locator(".room-mode-badge").getByText("Summary")
    ).toBeVisible();
  });

  test("modal shows votes count", async ({ page }) => {
    await setupRoomForFocus(page, "Modal Votes Test");

    // Open modal
    await page.locator(".focus-item").first().click();

    // Modal should show votes
    await expect(page.locator(".focus-modal-votes")).toBeVisible();
    await expect(page.locator(".focus-modal-votes")).toContainText("votes");
  });
});
