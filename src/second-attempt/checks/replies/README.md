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

## Limits

- The set is small and written by one person in one evening. It shows whether a gap exists, not how large it is.
- The model's answers were produced by Claude in the build session, by hand from the prompt, not by an API call from the prototype. The prototype still calls no model.
- The replies are invented by a real person, not collected from real customers.
