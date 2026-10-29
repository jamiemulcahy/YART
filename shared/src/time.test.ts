import { describe, expect, it } from "vitest";
import { formatDuration, parseDuration } from "./time";

describe("parseDuration", () => {
  it.each([
    ["1:30", 90],
    ["0:05", 5],
    ["00:05", 5],
    [":45", 45],
    ["30", 30],
    ["5", 5],
    ["90", 90],
    ["130", 90],
    ["500", 300],
    ["1500", 900],
    ["45s", 45],
    ["45 secs", 45],
    ["2m", 120],
    ["2m30s", 150],
    ["1.5 min", 90],
    ["0.5m", 30],
  ])("%s is %i seconds", (input, seconds) => {
    expect(parseDuration(input)).toBe(seconds * 1000);
  });

  it.each(["", "banana", "1:75", "1:2:3", "-5", "5.5"])("rejects %j", (input) => {
    expect(parseDuration(input)).toBeNull();
  });

  it("round-trips with formatDuration", () => {
    expect(formatDuration(parseDuration("2:05") ?? 0)).toBe("2:05");
  });
});
