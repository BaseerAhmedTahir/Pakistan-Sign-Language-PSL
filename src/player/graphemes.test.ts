import { describe, expect, it } from "vitest";
import { graphemes } from "./SignPlayer";

describe("graphemes (fingerspelling segmentation)", () => {
  it("splits Latin words into letters", () => {
    expect(graphemes("ALI")).toEqual(["A", "L", "I"]);
  });

  it("keeps an Urdu letter + combining mark as ONE cluster", () => {
    // alef + fatha must not split into a bare alef and an orphaned mark —
    // that would silently fingerspell the wrong letter.
    expect(graphemes("اَب")).toEqual(["اَ", "ب"]);
  });

  it("splits plain Urdu words into letters", () => {
    expect(graphemes("اب")).toEqual(["ا", "ب"]);
  });
});
