import { test, expect } from "@playwright/test";

test.describe("Room Creation Flow", () => {
  test("can create a room and see owner key modal", async ({ page }) => {
    await page.goto("/");

    // Fill in room name
    await page.getByLabel("Room Name").fill("Test Retrospective");

    // Click create button
    await page.getByRole("button", { name: "Create Room" }).click();

    // Owner key modal should be visible
    await expect(page.getByText("Room Created Successfully!")).toBeVisible();
    await expect(page.getByText("Your room has been created")).toBeVisible();

    // Should show room ID and owner key labels in modal
    await expect(
      page.getByText("Room ID (share with participants)")
    ).toBeVisible();
    await expect(page.getByText("Owner Key (keep this secret!)")).toBeVisible();

    // Should show copy buttons
    const copyButtons = page.getByRole("button", { name: "Copy" });
    await expect(copyButtons.first()).toBeVisible();

    // Click "Enter Room" to navigate
    await page.getByRole("button", { name: "Enter Room" }).click();

    // Should navigate to room page
    await expect(page).toHaveURL(/\/room\//);

    // Should see room header with room name
    await expect(page.getByText("Test Retrospective")).toBeVisible();
  });

  test("room creator is shown as owner in edit mode", async ({ page }) => {
    await page.goto("/");

    // Create room
    await page.getByLabel("Room Name").fill("Owner Test Room");
    await page.getByRole("button", { name: "Create Room" }).click();

    // Wait for modal and click Enter Room
    await expect(page.getByText("Room Created Successfully!")).toBeVisible();
    await page.getByRole("button", { name: "Enter Room" }).click();

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

    // Create room
    await page.getByLabel("Room Name").fill("Column Test Room");
    await page.getByRole("button", { name: "Create Room" }).click();

    // Wait for modal and enter room
    await expect(page.getByText("Room Created Successfully!")).toBeVisible();
    await page.getByRole("button", { name: "Enter Room" }).click();
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

    // Enter invalid room ID
    await page.getByLabel("Room ID").fill("invalid-room-id-12345");

    // Click join button
    await page.getByRole("button", { name: "Join Room" }).click();

    // Should show error message
    await expect(page.getByText(/room not found/i)).toBeVisible();

    // Should still be on landing page
    await expect(page).toHaveURL("/");
  });
});
