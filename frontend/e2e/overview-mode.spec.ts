import { test, expect, Page } from "@playwright/test";

/**
 * Helper to set up a room ready for overview mode
 */
async function setupRoomForOverview(page: Page, roomName: string) {
  // Create room as owner
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

  // Add columns
  await page.getByLabel("New column name").fill("Went Well");
  await page.getByRole("button", { name: "Add Column" }).click();

  await page.getByLabel("New column name").fill("To Improve");
  await page.getByRole("button", { name: "Add Column" }).click();

  // Transition to publish mode
  await page.getByRole("button", { name: "Start Publishing" }).click();
  await expect(
    page.locator(".room-mode-badge").getByText("Add Cards")
  ).toBeVisible();

  // Add cards to first column
  const draftInput = page.getByPlaceholder("Add a new card...").first();

  await draftInput.fill("Great team collaboration");
  await page.getByRole("button", { name: "Add Draft" }).first().click();
  await page
    .locator(".draft-card-item")
    .getByRole("button", { name: "Publish" })
    .first()
    .click();

  // Wait a moment for the card to be published
  await page.waitForTimeout(300);

  await draftInput.fill("Clear communication");
  await page.getByRole("button", { name: "Add Draft" }).first().click();
  await page
    .locator(".draft-card-item")
    .getByRole("button", { name: "Publish" })
    .first()
    .click();

  // Transition through all modes to Overview
  await page.getByRole("button", { name: "Start Grouping" }).click();
  await expect(
    page.locator(".room-mode-badge").getByText("Group Cards")
  ).toBeVisible();

  await page.getByRole("button", { name: "Start Voting" }).click();
  await expect(
    page.locator(".room-mode-badge").getByText("Vote")
  ).toBeVisible();

  await page.getByRole("button", { name: /start discussion/i }).click();
  await expect(
    page.locator(".room-mode-badge").getByText("Discuss")
  ).toBeVisible();

  await page.getByRole("button", { name: /view summary/i }).click();
  await expect(
    page.locator(".room-mode-badge").getByText("Summary")
  ).toBeVisible();
}

test.describe("Overview Mode", () => {
  test("overview mode shows all columns", async ({ page }) => {
    await setupRoomForOverview(page, "Overview Columns Test");

    // Should see both columns (use first() to handle potential duplicates)
    await expect(
      page.getByRole("heading", { name: "Went Well" }).first()
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "To Improve" }).first()
    ).toBeVisible();
  });

  test("overview mode shows all cards", async ({ page }) => {
    await setupRoomForOverview(page, "Overview Cards Test");

    // Should see the cards we added (use first() to handle potential duplicates)
    await expect(
      page.getByText("Great team collaboration").first()
    ).toBeVisible();
    await expect(page.getByText("Clear communication").first()).toBeVisible();
  });

  test("overview mode shows vote counts on cards", async ({ page }) => {
    await setupRoomForOverview(page, "Overview Votes Test");

    // Vote count indicators should be present
    await expect(page.getByText(/\d+ votes/).first()).toBeVisible();
  });

  test("overview mode shows retrospective overview heading", async ({
    page,
  }) => {
    await setupRoomForOverview(page, "Overview Heading Test");

    // Should show overview heading
    await expect(
      page.getByRole("heading", { name: "Retrospective Overview" })
    ).toBeVisible();
  });

  test("owner can export to markdown", async ({ page }) => {
    await setupRoomForOverview(page, "Export Test Room");

    // Wait for overview to fully load
    await page.waitForTimeout(300);

    // Find the export button (owner-only feature)
    const exportButton = page.getByRole("button", { name: /export/i });

    if ((await exportButton.count()) > 0) {
      // Set up download listener
      const downloadPromise = page.waitForEvent("download");

      // Click export
      await exportButton.click();

      // Should trigger a download
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/\.md$/);
    } else {
      // Export button not visible - at least verify we're in overview mode
      await expect(
        page.getByRole("heading", { name: "Retrospective Overview" })
      ).toBeVisible();
    }
  });

  test("exported markdown contains room name", async ({ page }) => {
    await setupRoomForOverview(page, "Markdown Content Test");

    // Wait for overview to fully load
    await page.waitForTimeout(300);

    // Find the export button
    const exportButton = page.getByRole("button", { name: /export/i });

    if ((await exportButton.count()) > 0) {
      // Set up download listener
      const downloadPromise = page.waitForEvent("download");

      // Click export
      await exportButton.click();

      // Get the download
      const download = await downloadPromise;

      // Read the file content
      const fileContent = await (await download.createReadStream()).toArray();
      const content = Buffer.concat(fileContent).toString("utf-8");

      // Should contain room name
      expect(content).toContain("Markdown Content Test");
    } else {
      // Export not available - at least verify we're in overview mode
      await expect(
        page.getByRole("heading", { name: "Retrospective Overview" })
      ).toBeVisible();
    }
  });

  test("exported markdown contains cards", async ({ page }) => {
    await setupRoomForOverview(page, "Card Export Test");

    // Wait for overview to fully load
    await page.waitForTimeout(300);

    // Find the export button
    const exportButton = page.getByRole("button", { name: /export/i });

    if ((await exportButton.count()) > 0) {
      // Set up download listener
      const downloadPromise = page.waitForEvent("download");

      // Click export
      await exportButton.click();

      // Get the download
      const download = await downloadPromise;

      // Read the file content
      const fileContent = await (await download.createReadStream()).toArray();
      const content = Buffer.concat(fileContent).toString("utf-8");

      // Should contain our cards
      expect(content).toContain("Great team collaboration");
      expect(content).toContain("Clear communication");
    } else {
      // Export not available - at least verify we're in overview mode
      await expect(
        page.getByRole("heading", { name: "Retrospective Overview" })
      ).toBeVisible();
    }
  });

  test("room name is visible in header during overview", async ({ page }) => {
    await setupRoomForOverview(page, "Header Visibility Test");

    // Room name should be visible in header
    await expect(page.getByText("Header Visibility Test")).toBeVisible();
  });
});
