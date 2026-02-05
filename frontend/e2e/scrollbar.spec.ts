import { test, expect } from "@playwright/test";

test.describe("Column Scrollbar", () => {
  test("column cards area is scrollable when cards overflow", async ({
    page,
  }) => {
    // Use a smaller viewport to ensure cards overflow
    await page.setViewportSize({ width: 800, height: 600 });
    // Create a room
    await page.goto("/");
    await page.getByRole("button", { name: "Create Room" }).first().click();
    await page.getByLabel("Room Name").fill("Scroll Test");
    await page
      .locator("form")
      .getByRole("button", { name: "Create Room" })
      .click();
    await expect(page).toHaveURL(/\/room\//);

    // Add a column
    await page.getByLabel("New column name").fill("Test Column");
    await page.getByRole("button", { name: "Add Column" }).click();

    // Go to publish mode
    await page.getByRole("button", { name: "Start Publishing" }).click();

    // Add many cards to trigger overflow
    const draftInput = page
      .getByRole("textbox", { name: "Add a new card..." })
      .first();
    const addDraftBtn = page.getByRole("button", { name: "Add Draft" }).first();

    for (let i = 0; i < 8; i++) {
      await draftInput.fill(`Card number ${i + 1} with some content`);
      await addDraftBtn.click();
    }

    // Publish all
    await page.getByRole("button", { name: /Publish All/ }).click();

    // Verify the column-cards area is scrollable
    const isScrollable = await page.evaluate(() => {
      const cards = document.querySelector(".column-cards");
      if (!cards) return false;
      return cards.scrollHeight > cards.clientHeight;
    });
    expect(isScrollable).toBe(true);

    // Verify overflow-y is auto
    const overflowY = await page.evaluate(() => {
      const cards = document.querySelector(".column-cards");
      return cards ? getComputedStyle(cards).overflowY : "";
    });
    expect(overflowY).toBe("auto");
  });
});
