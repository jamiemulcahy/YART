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

  test("landing page has tabbed interface with join and create tabs", async ({
    page,
  }) => {
    await page.goto("/");

    // Check for tab navigation
    const joinTab = page.getByRole("button", { name: "Join Room" }).first();
    const createTab = page.getByRole("button", { name: "Create Room" }).first();
    await expect(joinTab).toBeVisible();
    await expect(createTab).toBeVisible();

    // Join tab should be active by default and show Room ID input
    await expect(page.getByLabel("Room ID")).toBeVisible();

    // Click Create tab
    await createTab.click();
    await expect(page.getByLabel("Room Name")).toBeVisible();

    // Click Join tab to switch back
    await joinTab.click();
    await expect(page.getByLabel("Room ID")).toBeVisible();
  });

  test("join room button is disabled when room ID is empty", async ({
    page,
  }) => {
    await page.goto("/");

    // The submit button inside the form should be disabled when empty
    const joinSubmitButton = page.locator("form").getByRole("button", {
      name: "Join Room",
    });
    await expect(joinSubmitButton).toBeDisabled();
  });

  test("create room button is disabled when room name is empty", async ({
    page,
  }) => {
    await page.goto("/");

    // Switch to create tab
    await page.getByRole("button", { name: "Create Room" }).first().click();

    // The submit button inside the form should be disabled when empty
    const createSubmitButton = page.locator("form").getByRole("button", {
      name: "Create Room",
    });
    await expect(createSubmitButton).toBeDisabled();
  });
});
