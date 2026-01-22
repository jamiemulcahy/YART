import { test, expect } from "@playwright/test";

test.describe("Room Creation Flow", () => {
  test("can create a room and navigate directly to it", async ({ page }) => {
    await page.goto("/");

    // Switch to Create tab
    await page.getByRole("button", { name: "Create Room" }).first().click();

    // Fill in room name
    await page.getByLabel("Room Name").fill("Test Retrospective");

    // Click create button
    await page
      .locator("form")
      .getByRole("button", { name: "Create Room" })
      .click();

    // Should navigate directly to room page (no modal shown)
    await expect(page).toHaveURL(/\/room\//);

    // Should see room header with room name
    await expect(page.getByText("Test Retrospective")).toBeVisible();
  });

  test("room creator is shown as owner in edit mode", async ({ page }) => {
    await page.goto("/");

    // Switch to Create tab
    await page.getByRole("button", { name: "Create Room" }).first().click();

    // Create room
    await page.getByLabel("Room Name").fill("Owner Test Room");
    await page
      .locator("form")
      .getByRole("button", { name: "Create Room" })
      .click();

    // Wait for room page
    await expect(page).toHaveURL(/\/room\//);

    // Should be in Edit mode (shows "Setup" badge in header)
    await expect(
      page.locator(".room-mode-badge").getByText("Setup")
    ).toBeVisible();

    // Owner should see "Configure Columns" heading
    await expect(
      page.getByRole("heading", { name: "Configure Columns" })
    ).toBeVisible();
  });

  test("can create room and add columns", async ({ page }) => {
    await page.goto("/");

    // Switch to Create tab
    await page.getByRole("button", { name: "Create Room" }).first().click();

    // Create room
    await page.getByLabel("Room Name").fill("Column Test Room");
    await page
      .locator("form")
      .getByRole("button", { name: "Create Room" })
      .click();

    // Wait for room page
    await expect(page).toHaveURL(/\/room\//);

    // Wait for the edit mode to load
    await expect(
      page.getByRole("heading", { name: "Configure Columns" })
    ).toBeVisible();

    // Fill in the new column name input
    await page.getByLabel("New column name").fill("What went well");

    // Add the column
    await page.getByRole("button", { name: "Add Column" }).click();

    // Should see at least one column with the name we entered
    const columnInputs = page.getByRole("textbox", {
      name: /Column name: What went well/,
    });
    await expect(columnInputs.first()).toBeVisible();
  });

  test("join room with invalid ID shows error", async ({ page }) => {
    await page.goto("/");

    // Enter invalid room ID (Join tab is active by default)
    await page.getByLabel("Room ID").fill("invalid-room-id-12345");

    // Click join button
    await page
      .locator("form")
      .getByRole("button", { name: "Join Room" })
      .click();

    // Should show error message
    await expect(page.getByText(/room not found/i)).toBeVisible();

    // Should still be on landing page
    await expect(page).toHaveURL("/");
  });

  test("room header shows share room button", async ({ page }) => {
    await page.goto("/");

    // Switch to Create tab
    await page.getByRole("button", { name: "Create Room" }).first().click();

    // Create room
    await page.getByLabel("Room Name").fill("Share Test");
    await page
      .locator("form")
      .getByRole("button", { name: "Create Room" })
      .click();

    // Wait for room page
    await expect(page).toHaveURL(/\/room\//);

    // Should see the share room button
    const shareButton = page.locator(".share-room-btn");
    await expect(shareButton).toBeVisible();
    await expect(shareButton).toContainText("Share room");
  });
});
