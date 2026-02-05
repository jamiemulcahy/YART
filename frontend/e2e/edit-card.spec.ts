import { test, expect } from "@playwright/test";

test.describe("Edit Card", () => {
  test("can edit a published card via edit button", async ({ page }) => {
    // Create a room
    await page.goto("/");
    await page.getByRole("button", { name: "Create Room" }).first().click();
    await page.getByLabel("Room Name").fill("Edit Card Test");
    await page
      .locator("form")
      .getByRole("button", { name: "Create Room" })
      .click();
    await expect(page).toHaveURL(/\/room\//);

    // Add a column
    await page.getByLabel("New column name").fill("Ideas");
    await page.getByRole("button", { name: "Add Column" }).click();

    // Go to publish mode
    await page.getByRole("button", { name: "Start Publishing" }).click();

    // Add and publish a card
    const draftInput = page
      .getByRole("textbox", { name: "Add a new card..." })
      .first();
    await draftInput.fill("Original text");
    await page.getByRole("button", { name: "Add Draft" }).first().click();
    await page.getByRole("button", { name: /Publish All/ }).click();

    // Verify original content
    await expect(page.getByText("Original text")).toBeVisible();

    // Click edit button
    await page.getByRole("button", { name: "Edit this card" }).click();

    // Verify textarea appears with original content
    const textarea = page.getByRole("textbox", { name: "Edit card content" });
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveValue("Original text");

    // Edit the content
    await textarea.clear();
    await textarea.fill("Updated text");
    await textarea.press("Enter");

    // Verify card shows updated content
    await expect(page.getByText("Updated text")).toBeVisible();
    await expect(page.getByText("Original text")).not.toBeVisible();
  });

  test("can cancel edit with Escape", async ({ page }) => {
    // Create a room with a published card
    await page.goto("/");
    await page.getByRole("button", { name: "Create Room" }).first().click();
    await page.getByLabel("Room Name").fill("Cancel Edit Test");
    await page
      .locator("form")
      .getByRole("button", { name: "Create Room" })
      .click();
    await expect(page).toHaveURL(/\/room\//);

    await page.getByLabel("New column name").fill("Column");
    await page.getByRole("button", { name: "Add Column" }).click();
    await page.getByRole("button", { name: "Start Publishing" }).click();

    const draftInput = page
      .getByRole("textbox", { name: "Add a new card..." })
      .first();
    await draftInput.fill("Keep this text");
    await page.getByRole("button", { name: "Add Draft" }).first().click();
    await page.getByRole("button", { name: /Publish All/ }).click();

    // Start editing
    await page.getByRole("button", { name: "Edit this card" }).click();
    const textarea = page.getByRole("textbox", { name: "Edit card content" });
    await textarea.clear();
    await textarea.fill("Changed text");

    // Cancel with Escape
    await textarea.press("Escape");

    // Original text should remain
    await expect(page.getByText("Keep this text")).toBeVisible();
    await expect(page.getByText("Changed text")).not.toBeVisible();
  });
});
