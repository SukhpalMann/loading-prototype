// The result of the reply test, pinned. If the rule, the replies, the key or the model's
// answers change, this fails.

import { describe, expect, it } from "vitest";
import { ANSWER_KEY } from "./key";
import { MODEL_ANSWERS } from "./model-answers";
import { REPLIES } from "./replies";
import { MODEL_SCORE, RULE_ANSWERS, RULE_SCORE } from "./score";

describe("the reply test: 30 replies written by hand, 15 of which say money moved", () => {
  it("has 30 replies, 30 key entries and 30 answers from each reader", () => {
    expect([REPLIES.length, ANSWER_KEY.length, MODEL_ANSWERS.length, RULE_ANSWERS.length]).toEqual([
      30, 30, 30, 30,
    ]);
    expect(ANSWER_KEY.filter((k) => k === "D").length).toBe(15);
  });

  it("the answers are the ones committed before the key was seen", () => {
    expect(RULE_ANSWERS.join("")).toBe("DNDNNNNDDDDNDDNDNNNDDDDDDNDDND");
    expect(MODEL_ANSWERS.map((m) => m.answer).join("")).toBe("DNDDNNDNDDNNDNDNNDNDDNNDNDNDND");
  });

  it("the keyword rule gets 17 right, misses 5 of the 15 debit reports and raises 8 false alarms", () => {
    expect(RULE_SCORE.correct).toBe(17);
    expect(RULE_SCORE.caught).toBe(10);
    expect(RULE_SCORE.missed).toEqual([4, 7, 15, 18, 26]);
    expect(RULE_SCORE.falseAlarms).toEqual([8, 11, 14, 16, 22, 23, 25, 27]);
  });

  it("the model gets all 30 right", () => {
    expect(MODEL_SCORE.correct).toBe(30);
    expect(MODEL_SCORE.missed).toEqual([]);
    expect(MODEL_SCORE.falseAlarms).toEqual([]);
  });
});
