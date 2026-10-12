# Reply test: does reading customer replies need a model?

Second Attempt asks customers to reply if money has left their account. One such reply must switch off the payment link. This folder tests two ways of reading those replies.

## The question

For each reply: does it say that money has left the customer's account, or that the order is already paid?

- **D** means yes. The link must be switched off.
- **N** means no.

The costly mistake is a **missed D**: the link stays on for a customer who has already been debited. A false alarm costs less: a link is switched off that could have stayed on.

## The two readers

1. **A keyword rule,** [`rule.ts`](rule.ts). About thirty patterns in English, romanised Hindi and Devanagari, with a guard for plain negations. It is meant to be the fair baseline a careful engineer would write in half an hour.
2. **A language model,** given only the prompt in [`model-prompt.md`](model-prompt.md).

## The order of events, which is the point

1. The keyword rule and the model prompt were committed **before any test reply existed**.
2. Sukhpal wrote the replies by hand and sent them **without the answer key**.
3. Both readers' answers were committed.
4. Only then was the answer key added and both readers scored.

The commit history of this folder shows that order.

## Result

Thirty replies, fifteen of which say money moved.

| Reader       | Right, of 30 | Debit reports caught, of 15 | Missed | False alarms, of 15 |
| ------------ | ------------ | --------------------------- | ------ | ------------------- |
| Keyword rule | 17           | 10                          | 5      | 8                   |
| Model        | 30           | 15                          | 0      | 0                   |

The files, in the order they were committed: [`rule.ts`](rule.ts) and [`model-prompt.md`](model-prompt.md), then [`replies.ts`](replies.ts), [`model-answers.ts`](model-answers.ts) and [`answers-before-key.md`](answers-before-key.md), then [`key.ts`](key.ts) and [`score.ts`](score.ts). [`score.test.ts`](score.test.ts) pins the result.

### Where the keyword rule missed a debit report

These are the costly mistakes: the link would have stayed on.

| #   | Reply                                                             | Why the rule missed it                                               |
| --- | ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| 4   | "screen pe failed tha but balance 1248 kam ho gaya"               | The balance fell. No listed phrase sits close enough to "balance"    |
| 7   | "dusra link mila tha uspe kar diya, receipt bhi hai"              | Paid through another link. "kar diya" appears with no payment word   |
| 15  | "पहले खाते में 5000 थे अब 3752 हैं"                               | Arithmetic: the balance fell by exactly the order amount             |
| 18  | "refund nahi chahiye mujhe. jo 1248 liye hain uska order bhej do" | "refund" is cancelled by the negation, and "liye hain" is not listed |
| 26  | "card nahi chala toh bank transfer kar diya store ko"             | Paid by bank transfer, a route the list does not cover               |

### Where the keyword rule raised a false alarm

| #         | What happened                                                                             |
| --------- | ----------------------------------------------------------------------------------------- |
| 8, 16, 22 | The word "paid" used about not paying: "did you get paid?", "paid krna tha", a typed slip |
| 14        | A question about the keyword itself: "PAID reply karne se order confirm hoga kya?"        |
| 11        | "katne se pehle hi cancel kar diya": "kar diya" read as done                              |
| 23, 25    | "refund" used to say that no refund is due                                                |
| 27        | "koi paisa nahi gaya": the negation sits inside the matched phrase                        |

### What this shows, and what it does not

- It shows that a gap exists on hard replies: negation, self-correction, arithmetic, paraphrase and mixed script.
- It does not show the size of the gap in real traffic. These replies were written to include hard cases. Most real replies are easy, and on the easy ones here (1, 3, 10, 20) both readers agree.
- A longer keyword list would fix some of these and add new false alarms. Each fix is one more pattern.
- A cautious first version can use both: switch the link off when either reader says money moved. On this set that misses nothing and keeps the rule's eight false alarms.

## Limits

- The set is small and written by one person in one evening. It shows whether a gap exists, not how large it is.
- The model's answers were produced by Claude in the build session, by hand from the prompt, not by an API call from the prototype. The prototype still calls no model.
- The replies are invented by a real person, not collected from real customers.
- After the test, the retry message gained a one-tap reply on WhatsApp. A tap needs no reader at all. This test is about replies that are typed, and how many customers reply at all is not known.
