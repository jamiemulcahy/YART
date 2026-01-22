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

  test("landing page has join and create sections", async ({ page }) => {
    await page.goto("/");

    // Check for join section
    await expect(
      page.getByRole("heading", { name: "Join a Room" })
    ).toBeVisible();
    await expect(page.getByLabel("Room ID")).toBeVisible();
    await expect(page.getByRole("button", { name: "Join Room" })).toBeVisible();

    // Check for create section
    await expect(
      page.getByRole("heading", { name: "Create a Room" })
    ).toBeVisible();
    await expect(page.getByLabel("Room Name")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create Room" })
    ).toBeVisible();
  });

  test("join room button is disabled when room ID is empty", async ({
    page,
  }) => {
    await page.goto("/");

    const joinButton = page.getByRole("button", { name: "Join Room" });
    await expect(joinButton).toBeDisabled();
  });

  test("create room button is disabled when room name is empty", async ({
    page,
  }) => {
    await page.goto("/");

    const createButton = page.getByRole("button", { name: "Create Room" });
    await expect(createButton).toBeDisabled();
  });
});
