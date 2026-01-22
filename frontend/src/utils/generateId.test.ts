import { describe, it, expect } from "vitest";
import { generateId } from "./generateId";

describe("generateId", () => {
  it("generates an ID of the specified length", () => {
    const id = generateId(8);
    expect(id).toHaveLength(8);
  });

  it("generates different IDs on each call", () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
  });

  it("only contains alphanumeric characters", () => {
    const id = generateId(100);
    expect(id).toMatch(/^[A-Za-z0-9]+$/);
  });

  it("uses default length of 8", () => {
    const id = generateId();
    expect(id).toHaveLength(8);
  });
});
