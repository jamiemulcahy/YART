import { test, expect } from "@playwright/test";

test.describe("App Loading", () => {
  test("app loads without errors", async ({ page }) => {
    // Navigate to home page
    await page.goto("/");

    // Wait for React to render
    await page.waitForSelector("h1");

    // Check that the landing page is displayed
    await expect(page.getByRole("heading", { name: "YART" })).toBeVisible();

    // Verify no console errors occurred
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // Give time for any delayed errors
    await page.waitForTimeout(500);
    expect(consoleErrors).toHaveLength(0);
  });

  test("landing page displays tagline", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("Yet Another Retro Tool")).toBeVisible();
  });
});
