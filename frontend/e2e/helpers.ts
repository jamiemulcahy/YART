import { expect } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";

export const WORKER_URL = "http://localhost:8797";

/** Creates a room through the UI and returns the owner's page and the room code. */
export async function createRoom(
  page: Page,
  opts: { name?: string; template?: string } = {}
): Promise<string> {
  await page.goto("/");
  await page.getByLabel("Retro name").fill(opts.name ?? "Test retro");
  if (opts.template) await page.getByText(opts.template, { exact: true }).click();
  await page.getByRole("button", { name: "Create room" }).click();
  await page.waitForURL(/\/r\/[A-Z0-9]{6}$/);
  await expect(page.getByText("Facilitator", { exact: true })).toBeVisible();
  return page.url().split("/r/")[1] as string;
}

/** A fresh browser context (separate storage = separate person) joined to the room. */
export async function joinRoom(
  browser: Browser,
  code: string,
  opts: { viewer?: boolean } = {}
): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`/r/${code}`);
  await page
    .getByRole("button", { name: opts.viewer ? "Join as viewer (shared screen)" : "Join retro" })
    .click();
  await expect(page.locator(".room-header")).toBeVisible();
  return page;
}

export async function myName(page: Page): Promise<string> {
  return (await page.locator(".me-name").textContent()) ?? "";
}

export async function nextPhase(owner: Page, phase: string): Promise<void> {
  await owner.getByRole("button", { name: `Next: ${phase} →` }).click();
  await expect(owner.locator(".step.current")).toContainText(phase);
}

export async function addCard(page: Page, lane: string, text: string): Promise<void> {
  const input = page.getByRole("textbox", { name: `New card in ${lane}` });
  await input.fill(text);
  // Typing always lands in the private tray; publishing is a separate click.
  await input.press("Enter");
  await page
    .getByRole("article", { name: `Draft: ${text}` })
    .getByRole("button", { name: "Publish" })
    .click();
  await expect(page.locator(".card:not(.draft)", { hasText: text }).first()).toBeVisible();
}

export async function expectPhase(page: Page, phase: string): Promise<void> {
  await expect(page.locator(".step.current")).toContainText(phase);
}

/** Opens a raw protocol socket, says hello and resolves with the welcome + snapshot. */
export async function rawSocket(code: string, hello: Record<string, unknown> = {}) {
  const ws = new WebSocket(`${WORKER_URL.replace("http", "ws")}/api/rooms/${code}/ws`);
  const messages: Record<string, unknown>[] = [];
  const waiters: {
    pred: (m: Record<string, unknown>) => boolean;
    resolve: (m: Record<string, unknown>) => void;
  }[] = [];
  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(String(e.data)) as Record<string, unknown>;
    messages.push(msg);
    for (const w of [...waiters]) {
      if (w.pred(msg)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(msg);
      }
    }
  });
  const closed = new Promise<number>((resolve) => ws.addEventListener("close", (e) => resolve(e.code)));
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => resolve());
    ws.addEventListener("error", () => reject(new Error("socket error")));
  });
  const next = (pred: (m: Record<string, unknown>) => boolean, timeoutMs = 5000) => {
    const found = messages.find(pred);
    if (found) return Promise.resolve(found);
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timed out waiting for message")), timeoutMs);
      waiters.push({
        pred,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
      });
    });
  };
  const send = (msg: unknown) => ws.send(typeof msg === "string" ? msg : JSON.stringify(msg));
  send({ t: "hello", ...hello });
  const welcome = await next((m) => m.t === "welcome");
  await next((m) => m.t === "snapshot");
  return { ws, messages, next, send, welcome, closed };
}

export async function apiCreateRoom(
  lanes = [
    { title: "Good", description: "" },
    { title: "Bad", description: "" },
  ]
) {
  const res = await fetch(`${WORKER_URL}/api/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "API room", lanes }),
  });
  return (await res.json()) as { code: string; ownerKey: string };
}

/** Settings checkboxes reflect server state, so click and wait for the round trip. */
export async function toggle(page: Page, label: string, checked: boolean): Promise<void> {
  const box = page.getByLabel(label);
  if ((await box.isChecked()) !== checked) await box.click();
  await expect(box).toBeChecked({ checked });
}
