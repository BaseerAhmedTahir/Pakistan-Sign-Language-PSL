import { describe, expect, it } from "vitest";
import { translate, type Lexicon } from "./translate";
// Test against the REAL shipped lexicon so rule and data regressions both surface.
import lexiconJson from "../../public/engine/lexicon.json";

const lexicon = lexiconJson as unknown as Lexicon;

const glosses = (text: string) => translate(text, lexicon).glosses;

describe("translate: lexicon mapping", () => {
  it("maps greetings and drops punctuation", () => {
    expect(glosses("Hello, Ali!")).toEqual(["HELLO", "ALI"]);
  });

  it("greedy multi-word phrase match", () => {
    expect(glosses("thank you doctor")).toEqual(["THANK-YOU", "DOCTOR"]);
  });

  it("drops function words", () => {
    expect(glosses("the doctor is good")).toEqual(["DOCTOR", "GOOD"]);
  });

  it("passes unknown words through uppercased for fingerspelling", () => {
    expect(glosses("zebra")).toEqual(["ZEBRA"]);
  });

  it("returns empty for stopword-only input", () => {
    expect(glosses("the a is")).toEqual([]);
  });
});

describe("translate: reordering rules", () => {
  it("WH words move to the end", () => {
    expect(glosses("Where is the hospital?")).toEqual(["HOSPITAL", "WHERE"]);
  });

  it("time words front, negation sentence-final", () => {
    expect(glosses("I am not happy today")).toEqual(["TODAY", "ME", "HAPPY", "NOT"]);
  });
});

describe("translate: Urdu", () => {
  it("maps Urdu words, drops Urdu case markers, WH-final", () => {
    expect(glosses("سلام، آپ کا نام کیا ہے؟")).toEqual(["HELLO", "YOU", "NAME", "WHAT"]);
  });

  it("fronts Urdu time word and ends with NOT", () => {
    expect(glosses("مجھے آج درد نہیں")).toEqual(["TODAY", "مجھے", "PAIN", "NOT"]);
  });
});

describe("translate: non-manual tier", () => {
  it("WH question gets a whole-sentence brow furrow span", () => {
    const { glosses: g, nmf } = translate("where is the hospital?", lexicon);
    expect(nmf).toEqual([
      { start: 0, end: g.length, expressions: { angry: 0.35 }, label: "wh-question brow furrow" },
    ]);
  });

  it("yes/no question (?, no WH) gets a brow raise span", () => {
    const { nmf } = translate("hello?", lexicon);
    expect(nmf).toEqual([
      { start: 0, end: 1, expressions: { surprised: 0.4 }, label: "yes/no question brow raise" },
    ]);
  });

  it("Urdu question mark ؟ also triggers the yes/no span", () => {
    const { nmf } = translate("سلام؟", lexicon);
    expect(nmf).toHaveLength(1);
    expect(nmf[0].expressions).toEqual({ surprised: 0.4 });
  });

  it("negation gets a headshake span on the NOT gloss", () => {
    const { glosses: g, nmf } = translate("I am not happy today", lexicon);
    const notIndex = g.indexOf("NOT");
    expect(nmf).toContainEqual({ start: notIndex, end: notIndex + 1, head: "shake", label: "negation headshake" });
  });

  it("plain statements get no spans", () => {
    expect(translate("hello doctor", lexicon).nmf).toEqual([]);
  });
});
