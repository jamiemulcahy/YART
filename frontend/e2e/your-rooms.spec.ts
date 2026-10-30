import { expect, test } from "@playwright/test";
import { apiCreateRoom, createRoom } from "./helpers";

test("the landing page lists rooms this browser can get back into", async ({ page }) => {
  // A room I facilitate…
  const mine = await createRoom(page, { name: "Alpha retro" });
  // …one I joined as a participant…
  const { code: joined } = await apiCreateRoom();
  await page.goto(`/r/${joined}`);
  await page.getByRole("button", { name: "Join retro" }).click();
  await expect(page.locator(".room-header")).toBeVisible();
  // …and a stale key for a room that no longer exists.
  await page.evaluate(() => localStorage.setItem("yart:token:ZZZZZZ", "stale"));

  await page.goto("/");
  const list = page.getByRole("region", { name: "Your rooms" });
  const alpha = list.getByRole("listitem", { name: "Room Alpha retro" });
  await expect(alpha).toContainText("Facilitator");
  await expect(alpha).toContainText("Setup");
  await expect(alpha).toContainText(`${mine.slice(0, 3)}-${mine.slice(3)}`);
  await expect(list.getByRole("listitem", { name: "Room API room" })).toContainText("Joined");
  // Rooms that are gone drop off by themselves.
  await expect(list.getByRole("listitem")).toHaveCount(2);

  // Most recently opened first.
  await expect(list.getByRole("listitem").first()).toHaveAccessibleName("Room API room");

  // Forgetting asks first, then removes it for good.
  await list.getByRole("button", { name: "Forget API room" }).click();
  await list.getByRole("button", { name: "Forget", exact: true }).click();
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole("region", { name: "Your rooms" }).getByRole("listitem")).toHaveCount(1);

  // Clicking a room takes you back in, still as facilitator.
  await page.getByRole("link", { name: /Alpha retro/ }).click();
  await expect(page.getByText("Facilitator", { exact: true })).toBeVisible();

  // Deleting the room removes it from the list too.
  await page.getByRole("button", { name: "⚙ Settings" }).click();
  await page.getByRole("button", { name: "Delete room…" }).click();
  await page.getByRole("button", { name: "Yes, delete room" }).click();
  await expect(page.getByText("This room has been deleted")).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Your rooms" })).toHaveCount(0);
});
