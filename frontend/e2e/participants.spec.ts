import { test, expect } from "@playwright/test";

test.describe("Participants", () => {
  test("owner badge shows for room creator in participants modal", async ({
    page,
  }) => {
    // Create a room
    await page.goto("/");
    await page.getByRole("button", { name: "Create Room" }).first().click();
    await page.getByLabel("Room Name").fill("Owner Badge Test");
    await page
      .locator("form")
      .getByRole("button", { name: "Create Room" })
      .click();
    await expect(page).toHaveURL(/\/room\//);

    // Open participants modal
    await page.getByRole("button", { name: "View participants" }).click();

    // Verify the modal shows
    const dialog = page.getByRole("dialog", { name: /Participants/ });
    await expect(dialog).toBeVisible();

    // Verify owner badge is shown
    await expect(dialog.getByText("Owner")).toBeVisible();

    // Verify (You) badge is shown
    await expect(dialog.getByText("(You)")).toBeVisible();
  });

  test("participant does not have owner badge", async ({ browser }) => {
    // Create a room as owner
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto("/");
    await ownerPage
      .getByRole("button", { name: "Create Room" })
      .first()
      .click();
    await ownerPage.getByLabel("Room Name").fill("Participant Test");
    await ownerPage
      .locator("form")
      .getByRole("button", { name: "Create Room" })
      .click();
    await expect(ownerPage).toHaveURL(/\/room\//);

    // Get the room URL
    const roomUrl = ownerPage.url();

    // Join as participant in a separate browser context (no owner key)
    const participantContext = await browser.newContext();
    const participantPage = await participantContext.newPage();
    await participantPage.goto(roomUrl);

    // Wait for connection
    await expect(
      participantPage.getByRole("button", { name: "View participants" })
    ).toContainText("2 participants");

    // Open participants modal as participant
    await participantPage
      .getByRole("button", { name: "View participants" })
      .click();
    const dialog = participantPage.getByRole("dialog", {
      name: /Participants/,
    });
    await expect(dialog).toBeVisible();

    // Verify participant sees Owner badge on the owner user
    await expect(dialog.getByText("Owner")).toBeVisible();

    // Verify participant sees (You) badge on themselves
    await expect(dialog.getByText("(You)")).toBeVisible();

    // The participant's header should show "Participant" not "Owner"
    await expect(
      participantPage.locator(".role-badge.participant")
    ).toBeVisible();

    await ownerContext.close();
    await participantContext.close();
  });
});
