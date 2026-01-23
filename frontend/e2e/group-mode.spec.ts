import { test, expect, Page } from "@playwright/test";

/**
 * Helper to set up a room with cards ready for grouping
 */
async function setupRoomForGrouping(page: Page, roomName: string) {
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

  await draftInput.fill("First card for grouping");
  await page.getByRole("button", { name: "Add Draft" }).first().click();
  await page
    .locator(".draft-card-item")
    .getByRole("button", { name: "Publish" })
    .first()
    .click();

  // Add second card
  await draftInput.fill("Second card for grouping");
  await page.getByRole("button", { name: "Add Draft" }).first().click();
  await page
    .locator(".draft-card-item")
    .getByRole("button", { name: "Publish" })
    .first()
    .click();

  // Add third card
  await draftInput.fill("Third card for grouping");
  await page.getByRole("button", { name: "Add Draft" }).first().click();
  await page
    .locator(".draft-card-item")
    .getByRole("button", { name: "Publish" })
    .first()
    .click();

  // Transition to Group mode
  await page.getByRole("button", { name: "Start Grouping" }).click();
  await expect(
    page.locator(".room-mode-badge").getByText("Group Cards")
  ).toBeVisible();
}

test.describe("Group Mode", () => {
  test("group mode shows cards organized by column", async ({ page }) => {
    await setupRoomForGrouping(page, "Group Display Test");

    // Should see the column header
    await expect(page.getByRole("heading", { name: "Feedback" })).toBeVisible();

    // Should see all cards (each with group-card class in the draggable view)
    await expect(page.locator(".group-card")).toHaveCount(3);
  });

  test("group mode shows drag instruction mentioning within column", async ({
    page,
  }) => {
    await setupRoomForGrouping(page, "Group Instruction Test");

    // Should show instruction for dragging within each column
    await expect(
      page.getByText(/drag cards.*within each column/i)
    ).toBeVisible();
  });

  test("cards are draggable with grab cursor", async ({ page }) => {
    await setupRoomForGrouping(page, "Card Cursor Test");

    // Cards should have the draggable class
    const firstCard = page.locator(".group-card.draggable").first();
    await expect(firstCard).toBeVisible();

    // Cards should be styled for drag interaction (cursor: grab via CSS)
    await expect(firstCard).toHaveClass(/draggable/);
  });

  test("owner can transition from group to vote mode", async ({ page }) => {
    await setupRoomForGrouping(page, "Group to Vote Test");

    // Owner should see the transition button
    const voteButton = page.getByRole("button", {
      name: /start voting/i,
    });
    await expect(voteButton).toBeVisible();

    // Click to transition
    await voteButton.click();

    // Should be in vote mode
    await expect(
      page.locator(".room-mode-badge").getByText("Vote")
    ).toBeVisible();
  });

  test("all cards show author name", async ({ page }) => {
    await setupRoomForGrouping(page, "Card Content Test");

    // Each card should show author name
    const authorLabels = page.locator(".group-card-author");
    await expect(authorLabels).toHaveCount(3);
  });

  test("column shows correct card count", async ({ page }) => {
    await setupRoomForGrouping(page, "Card Count Test");

    // Column header should show card count
    await expect(page.locator(".card-count")).toContainText("3");
  });
});
