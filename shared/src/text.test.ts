import { describe, expect, it } from "vitest";
import { cleanLine, cleanText } from "./limits";
import { nextColour, randomName, PARTICIPANT_COLOURS } from "./names";

describe("cleanText", () => {
  it("trims and keeps newlines", () => {
    expect(cleanText("  hello\nworld  ", 100)).toBe("hello\nworld");
  });
  it("strips control, zero-width and bidi-override characters", () => {
    expect(cleanText("a\u0000b​c‮d﻿", 100)).toBe("abcd");
  });
  it("collapses runs of blank lines", () => {
    expect(cleanText("a\n\n\n\n\nb", 100)).toBe("a\n\nb");
  });
  it("rejects empty and over-long text", () => {
    expect(cleanText(" ​ \n ", 100)).toBeNull();
    expect(cleanText("x".repeat(101), 100)).toBeNull();
    expect(cleanText("x".repeat(100), 100)).toBe("x".repeat(100));
  });
  it("cleanLine flattens whitespace", () => {
    expect(cleanLine("  a \n  b\tc ", 20)).toBe("a b c");
  });
});

describe("names and colours", () => {
  it("avoids names already taken", () => {
    const taken = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const name = randomName(taken);
      expect(taken.has(name)).toBe(false);
      taken.add(name);
    }
  });
  it("hands out every colour before repeating one", () => {
    const used: string[] = [];
    for (let i = 0; i < PARTICIPANT_COLOURS.length; i++) used.push(nextColour(used));
    expect(new Set(used).size).toBe(PARTICIPANT_COLOURS.length);
  });
});
