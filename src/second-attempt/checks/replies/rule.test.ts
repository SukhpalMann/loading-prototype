// Sanity cases for the keyword rule, written by its author before any test reply existed.
// They are NOT the test set. They only show the rule does what it was meant to do.

import { describe, expect, it } from "vitest";
import { ruleSaysMoneyMoved } from "./rule";

const MONEY_MOVED = [
  "PAID",
  "paid",
  "Mere account se paise kat gaye",
  "amount deducted but order not placed",
  "ho gaya",
  "पैसे कट गए",
  "payment ho gya h bhai",
  "already paid via gpay",
  "refund kar do",
  "debited 1248 from sbi",
];

const NOT_MOVED = [
  "not paid",
  "paisa nahi kata",
  "kya paisa katega?",
  "baad me karunga",
  "पैसे नहीं कटे",
  "link nahi khul raha",
  "cod kar do",
  "who is this",
  "stop",
];

describe("the keyword rule on its author's own sanity cases", () => {
  it.each(MONEY_MOVED)("reads %j as money moved", (text) => {
    expect(ruleSaysMoneyMoved(text)).toBe(true);
  });
  it.each(NOT_MOVED)("reads %j as no money moved", (text) => {
    expect(ruleSaysMoneyMoved(text)).toBe(false);
  });
});
