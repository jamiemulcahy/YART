import { test, expect } from "@playwright/test";

test.describe("Name Change", () => {
  test("can rename user via participants modal", async ({ page }) => {
    // Create a room
    await page.goto("/");
    await page.getByRole("button", { name: "Create Room" }).first().click();
    await page.getByLabel("Room Name").fill("Rename Test");
    await page
      .locator("form")
      .getByRole("button", { name: "Create Room" })
      .click();
    await expect(page).toHaveURL(/\/room\//);

    // Open participants modal
    await page.getByRole("button", { name: "View participants" }).click();
    await expect(
      page.getByRole("dialog", { name: "Participants" })
    ).toBeVisible();

    // Note the original name
    const originalName = await page.locator(".participant-name").textContent();
    expect(originalName).toBeTruthy();

    // Click edit button and change name
    await page.getByRole("button", { name: "Edit your name" }).click();
    const input = page.getByRole("textbox", { name: "Edit your name" });
    await input.clear();
    await input.fill("Alice");
    await input.press("Enter");

    // Verify name changed in the modal
    await expect(page.locator(".participant-name")).toHaveText("Alice");
  });

  test("renamed name persists after page refresh", async ({ page }) => {
    // Create a room
    await page.goto("/");
    await page.getByRole("button", { name: "Create Room" }).first().click();
    await page.getByLabel("Room Name").fill("Persist Name Test");
    await page
      .locator("form")
      .getByRole("button", { name: "Create Room" })
      .click();
    await expect(page).toHaveURL(/\/room\//);
    const roomUrl = page.url();

    // Rename user
    await page.getByRole("button", { name: "View participants" }).click();
    await page.getByRole("button", { name: "Edit your name" }).click();
    const input = page.getByRole("textbox", { name: "Edit your name" });
    await input.clear();
    await input.fill("Bob");
    await input.press("Enter");
    await expect(page.locator(".participant-name")).toHaveText("Bob");

    // Close modal
    await page.getByRole("button", { name: "Close" }).click();

    // Refresh the page
    await page.goto(roomUrl);

    // Open participants and verify name persisted
    await page.getByRole("button", { name: "View participants" }).click();
    await expect(page.locator(".participant-name")).toHaveText("Bob");
  });
});
