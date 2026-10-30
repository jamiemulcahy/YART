import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { addCard, createRoom, nextPhase } from "./helpers";

interface Debug {
  me: { x: number; y: number };
  remotes: string[];
  sentHits: number;
  charge: number;
  special: boolean;
  level: number;
}
const debug = (page: Page) =>
  page.evaluate(() => (window as unknown as { __yartBattle?: Debug }).__yartBattle ?? null);
const sounds = (page: Page) =>
  page.evaluate(() => (window as unknown as { __yartSounds?: string[] }).__yartSounds ?? []);

test("ships are chosen on joining and everyone flies in the same battle", async ({
  page: owner,
  browser,
}) => {
  test.setTimeout(150_000);
  await createRoom(owner, { pickShip: false });
  const code = owner.url().split("/r/")[1] as string;

  // The owner is asked to pick a ship before setting up.
  const choose = owner.getByRole("dialog", { name: "Choose your ship" });
  await expect(choose).toBeVisible();
  await choose.getByRole("radio", { name: /Lancer/ }).click();
  await expect(choose).toHaveCount(0);

  // Participants pick on the join screen and aren't asked again.
  const context = await browser.newContext();
  const alice = await context.newPage();
  await alice.goto(`/r/${code}`);
  await alice.getByRole("radio", { name: /Hornet/ }).click();
  await alice.getByRole("button", { name: "Join retro" }).click();
  await expect(alice.locator(".room-header")).toBeVisible();
  await expect(alice.getByRole("dialog", { name: "Choose your ship" })).toHaveCount(0);

  await nextPhase(owner, "Write");
  await addCard(alice, "Mad", "Defend me");
  await addCard(owner, "Sad", "And me");
  await nextPhase(owner, "Group");
  await nextPhase(owner, "Vote");
  await nextPhase(owner, "Discuss");
  await nextPhase(owner, "Battle");

  // Ships can be changed in the briefing.
  await expect(alice.getByRole("radio", { name: /Hornet/ })).toHaveAttribute("aria-checked", "true");
  await alice.getByRole("radio", { name: /Viper/ }).click();
  await expect(alice.getByRole("radio", { name: /Viper/ })).toHaveAttribute("aria-checked", "true");

  await owner.getByRole("button", { name: "Launch battle!" }).first().click();
  await expect(alice.getByRole("img", { name: /Battle arena/ })).toBeVisible();

  // Each player sees the other's ship.
  await expect.poll(async () => (await debug(alice))?.remotes.length ?? 0, { timeout: 15_000 }).toBe(1);
  await expect.poll(async () => (await debug(owner))?.remotes.length ?? 0, { timeout: 15_000 }).toBe(1);

  // Flying: thrust forward climbs, letting go drifts back.
  await alice.getByRole("img", { name: /Battle arena/ }).focus();
  const start = (await debug(alice))!.me.y;
  await alice.keyboard.down("w");
  await alice.waitForTimeout(800);
  const up = (await debug(alice))!.me.y;
  await alice.keyboard.up("w");
  expect(up).toBeLessThan(start - 100);
  await expect.poll(async () => (await debug(alice))!.me.y).toBeGreaterThan(up + 100);

  // Music is playing during the battle.
  expect(await sounds(alice)).toContain("music:start");

  // Hitting enemies charges the special; when it's full a chime plays and E unleashes it.
  await alice.keyboard.down(" ");
  await expect.poll(async () => (await debug(alice))?.charge ?? 0, { timeout: 60_000 }).toBe(60);
  await alice.keyboard.up(" ");
  await expect.poll(() => sounds(alice)).toContain("ready");
  await alice.keyboard.press("e");
  await expect.poll(async () => (await debug(alice))?.special).toBe(true);

  await owner.getByRole("button", { name: "End battle now" }).click();
  await expect(alice.getByRole("heading", { name: /line held|losses|called off/ })).toBeVisible();
  await expect.poll(async () => (await sounds(alice)).at(-1)).toBe("music:stop");
});
