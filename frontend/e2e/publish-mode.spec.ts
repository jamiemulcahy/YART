import { test, expect, Page } from "@playwright/test";

/**
 * Helper to create a room and navigate to it as owner
 */
async function createRoomAsOwner(page: Page, roomName: string) {
  await page.goto("/");
  await page.getByLabel("Room Name").fill(roomName);
  await page.getByRole("button", { name: "Create Room" }).click();
  await expect(page.getByText("Room Created Successfully!")).toBeVisible();
  await page.getByRole("button", { name: "Enter Room" }).click();
  await expect(page).toHaveURL(/\/room\//);
  // Wait for room to load
  await expect(
    page.getByRole("heading", { name: "Configure Columns" })
  ).toBeVisible();
}

/**
 * Helper to add a column
 */
async function addColumn(page: Page, columnName: string) {
  await page.getByLabel("New column name").fill(columnName);
  await page.getByRole("button", { name: "Add Column" }).click();
}

/**
 * Helper to transition to publish mode
 */
async function transitionToPublish(page: Page) {
  await page.getByRole("button", { name: "Start Publishing" }).click();
  // Wait for mode change
  await expect(
    page.locator(".room-mode-badge").getByText("Add Cards")
  ).toBeVisible();
}

test.describe("Publish Mode", () => {
  test("owner can transition from edit to publish mode", async ({ page }) => {
    await createRoomAsOwner(page, "Publish Test Room");

    // Add a column first (required for publish mode to be useful)
    await addColumn(page, "What went well");

    // Transition to publish mode
    await transitionToPublish(page);

    // Verify we're in publish mode
    await expect(
      page.locator(".room-mode-badge").getByText("Add Cards")
    ).toBeVisible();

    // Should see the column header (first one)
    await expect(
      page.getByRole("heading", { name: "What went well" }).first()
    ).toBeVisible();
  });

  test("user can create and see draft card", async ({ page }) => {
    await createRoomAsOwner(page, "Draft Card Test");
    await addColumn(page, "Ideas");
    await transitionToPublish(page);

    // Find the draft area and create a card (use first() since there may be multiple columns)
    const draftInput = page.getByPlaceholder("Add a new card...").first();
    await draftInput.fill("My first idea");
    await page.getByRole("button", { name: "Add Draft" }).first().click();

    // Draft card should appear in the draft area (use first to handle potential duplicates)
    await expect(page.getByText("My first idea").first()).toBeVisible();
  });

  test("user can publish a draft card", async ({ page }) => {
    await createRoomAsOwner(page, "Publish Card Test");
    await addColumn(page, "Things to improve");
    await transitionToPublish(page);

    // Create a draft card (use first() since there may be multiple columns)
    const draftInput = page.getByPlaceholder("Add a new card...").first();
    await draftInput.fill("Better documentation");
    await page.getByRole("button", { name: "Add Draft" }).first().click();

    // Wait for draft to appear
    await expect(page.getByText("Better documentation").first()).toBeVisible();

    // Publish the card (button is in .draft-card-actions)
    const publishButton = page
      .locator(".draft-card-item")
      .getByRole("button", { name: "Publish" })
      .first();
    await publishButton.click();

    // Card should still be visible (now as published)
    await expect(page.getByText("Better documentation").first()).toBeVisible();
  });

  test("user can delete a draft card", async ({ page }) => {
    await createRoomAsOwner(page, "Delete Draft Test");
    await addColumn(page, "Actions");
    await transitionToPublish(page);

    // Create a draft card (use first() since there may be multiple columns)
    const draftInput = page.getByPlaceholder("Add a new card...").first();
    await draftInput.fill("Card to delete");
    await page.getByRole("button", { name: "Add Draft" }).first().click();

    // Verify it appears
    await expect(page.getByText("Card to delete").first()).toBeVisible();

    // Delete the draft card
    const deleteButton = page
      .locator(".draft-card-item")
      .getByRole("button", { name: "Delete" })
      .first();
    await deleteButton.click();

    // Card should be removed (allow short time for removal)
    await expect(page.getByText("Card to delete")).toHaveCount(0);
  });

  test("owner can transition from publish to group mode", async ({ page }) => {
    await createRoomAsOwner(page, "Group Transition Test");
    await addColumn(page, "Feedback");
    await transitionToPublish(page);

    // Transition to group mode
    await page.getByRole("button", { name: "Start Grouping" }).click();

    // Should be in group mode
    await expect(
      page.locator(".room-mode-badge").getByText("Group Cards")
    ).toBeVisible();
  });

  test("multiple columns are displayed in publish mode", async ({ page }) => {
    await createRoomAsOwner(page, "Multi Column Test");

    // Add multiple columns
    await addColumn(page, "Went well");
    await addColumn(page, "To improve");
    await addColumn(page, "Actions");

    await transitionToPublish(page);

    // All columns should be visible (use first() to avoid strict mode violations)
    await expect(
      page.getByRole("heading", { name: "Went well" }).first()
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "To improve" }).first()
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Actions" }).first()
    ).toBeVisible();
  });
});
