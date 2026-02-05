import { test, expect } from "@playwright/test";

test.describe("Long Text", () => {
  test("long unbroken text wraps in focus mode discussion modal", async ({
    page,
  }) => {
    // Create a room
    await page.goto("/");
    await page.getByRole("button", { name: "Create Room" }).first().click();
    await page.getByLabel("Room Name").fill("Long Text Test");
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

    // Add a card with very long unbroken text
    const longText =
      "ThisIsAnExtremelyLongWordWithoutAnySpacesThatShouldWrapProperlyInAllModesAndNotOverflowTheContainerBoundaries";
    const draftInput = page
      .getByRole("textbox", { name: "Add a new card..." })
      .first();
    await draftInput.fill(longText);
    await page.getByRole("button", { name: "Add Draft" }).first().click();
    await page.getByRole("button", { name: /Publish All/ }).click();

    // Advance through modes to focus
    await page.getByRole("button", { name: "Start Grouping" }).click();
    await page.getByRole("button", { name: "Start Voting" }).click();
    await page.getByRole("button", { name: "Start Discussion" }).click();

    // Open the discussion modal
    await page.getByRole("button", { name: /Discuss card/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // The card text should be fully visible (wrapped, not overflowing)
    const cardText = dialog.locator("p").first();
    await expect(cardText).toContainText(longText);

    // The text element should not be wider than the modal
    const modalBox = await dialog.boundingBox();
    const textBox = await cardText.boundingBox();
    expect(modalBox).toBeTruthy();
    expect(textBox).toBeTruthy();
    expect(textBox!.width).toBeLessThanOrEqual(modalBox!.width);
  });
});
