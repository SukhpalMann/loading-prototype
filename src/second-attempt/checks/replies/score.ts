// Scores a reader's answers against the key. A "miss" is the costly mistake: a customer said
// money had left the account, and the reader did not see it, so the link would stay on.

import { ANSWER_KEY } from "./key";
import { MODEL_ANSWERS } from "./model-answers";
import { REPLIES } from "./replies";
import { ruleSaysMoneyMoved } from "./rule";

export interface Score {
  total: number;
  correct: number;
  moneyMoved: number; // replies the key marks D
  caught: number; // of those, how many the reader marked D
  missed: number[]; // reply numbers the reader marked N when the key says D
  falseAlarms: number[]; // reply numbers the reader marked D when the key says N
}

export function score(answers: ("D" | "N")[]): Score {
  const missed: number[] = [];
  const falseAlarms: number[] = [];
  let correct = 0,
    moneyMoved = 0,
    caught = 0;
  ANSWER_KEY.forEach((truth, i) => {
    const said = answers[i];
    if (truth === "D") moneyMoved++;
    if (said === truth) correct++;
    if (truth === "D" && said === "D") caught++;
    if (truth === "D" && said !== "D") missed.push(i + 1);
    if (truth === "N" && said === "D") falseAlarms.push(i + 1);
  });
  return { total: ANSWER_KEY.length, correct, moneyMoved, caught, missed, falseAlarms };
}

export const RULE_ANSWERS: ("D" | "N")[] = REPLIES.map((text) =>
  ruleSaysMoneyMoved(text) ? "D" : "N",
);
export const RULE_SCORE = score(RULE_ANSWERS);
export const MODEL_SCORE = score(MODEL_ANSWERS.map((m) => m.answer));
