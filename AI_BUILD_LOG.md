# AI build log: Second Attempt

Razorpay x ISB AI PM Build Challenge, Track 2 (Recover and Grow with AI).
Author: Sukhpal Singh Mann. Built on 12 and 13 October 2026.

Second Attempt is a concept prototype. It sorts failed payments into four lanes by cause, so each customer gets the right second attempt instead of the same payment link.

- Live prototype: https://second-attempt-recovery.lovable.app/
- Code: [`src/second-attempt/`](src/second-attempt/) in this repository

This log says which AI tools I used, how, where I overruled them, and what I decided myself.

**In brief**

- One assistant, Claude, did the research, the code and the drafts. I made the product decisions, and overruled or challenged its output where it shaped the idea (section 3).
- A second model reviewed the finished pack. Its findings changed the claim, the comparison and the headline number.
- The brief asks why this needs AI and not a fixed rule. I tested that question blind, on 30 customer replies I wrote by hand. A keyword rule missed 5 of the 15 replies that said money had left the account. A model missed none (section 2).
- The prototype's numbers quoted in the one-pager, the video and this log are pinned to the code by tests.
- What is missing: merchant interviews, real payment data, and a model call inside the prototype (section 5).

## 1. AI tools and models used

| Tool                                  | Model                                                                     | Used for                                                                                                                                                                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude (Anthropic), in the Claude app | Claude Fable 5.1 (`claude-fable-5-1`), the model selected for the session | Decoding the challenge brief, web research, comparing product directions, writing and testing the prototype code, drafting the written deliverables from my decisions, answering the reply test as the model reader, and recording the screen for the video |
| Lovable                               | Lovable's built-in agent (model not specified)                            | Creating the project scaffold from one prompt, hosting the prototype on a public link, and two-way sync with GitHub                                                                                                                                         |
| ChatGPT (OpenAI)                      | GPT-6.1 Sol                                                               | An outside critical review of the finished pack. It wrote no code                                                                                                                                                                                           |

No API keys were needed. The prototype makes no model calls at run time. See section 5.

## 2. Key prompts, workflow and agent setup

**The master prompt.** I started with one long prompt that set Claude's role (senior AI product manager, strategy consultant, AI architect and challenge evaluator) and seven phases: decode the brief, research Razorpay and merchant problems, compare the options, define the product, list what was needed from me, plan the execution, and plan the submission. It also set working rules. The ones that mattered most:

- Research before recommendations. No product ideas until Razorpay's own AI products were mapped.
- Separate evidence from assumptions, and never invent a statistic, an interview or a capability.
- Challenge my assumptions instead of agreeing with me.
- Do not build around a problem statement I have not approved.

**The workflow that followed.**

1. **Brief to checklist.** Claude turned the brief into pass or fail gates and a rubric, and separated the published criteria from its own guesses about what judges value.
2. **Research with verification.** About 60 searches and page reads, covering Razorpay's blog, docs and newsroom, press, and vendor blogs. Claude then re-opened every source behind a number it planned to use and copied the sentence out again to check it.
3. **Shortlist.** Five directions compared on ten weighted dimensions. The arithmetic was run in code, not in prose.
4. **Decisions by multiple choice.** Claude put each product decision to me as a short question with its recommendation marked. I answered six: the direction, the name, what runs without approval, when a discount is allowed, how recovery is proven, and hosting.
5. **Logic before screens.** Claude wrote the data generator and the sorting and simulation logic in TypeScript first, and tested them from the command line. Screens came after the numbers were stable.
6. **Screens with a browser in the loop.** Claude built the four screens in React, drove them in a headless browser, took screenshots, and fixed what it saw.
7. **Hosting.** Lovable created the project scaffold (TanStack Start, React, TypeScript, Tailwind) and hosts the app. Claude moved the prototype into that repository through Lovable's GitHub sync, then checked the result against the version it had tested. I published it from Lovable. Section 5 lists the checks.
8. **Numbers pinned to the code.** Claude derived every number on the four screens again from the code and wrote tests that fail if a quoted number changes. The same pass built a comparison the pack had lacked: one payment link for everyone, under the same assumed rates.
9. **Outside review by a second model.** Claude wrote a context file and a review prompt. The prompt told the reviewer to distrust the context file, because the assistant that built the product had written it. I ran both in ChatGPT. Claude checked each claim before acting on it, including the competitor it named. Section 3 lists what changed.
10. **A blind test of the model's one job.** Described below.

**The blind reply test.** The brief asks why the product needs AI and not a fixed rule. My answer was narrow: rules and verified payment status decide every action, and a model reads only what rules cannot, such as a customer's free-text reply. The outside review pointed out that this had never been tested. On the evening of 12 October I tested it.

1. Claude wrote a keyword rule: about thirty patterns in English, romanised Hindi and Devanagari, with a guard for negation. It also wrote the prompt a model would be given. Both were committed before any test reply existed (`895f583`, 10:50 PM IST).
2. I wrote 30 replies by hand, as a customer answering the retry message. Fifteen say that money had left the account or that the order was already paid. I sent them without my answer key.
3. Both readers' answers were committed (`0487c1b`, 11:06 PM).
4. I sent the key, and both were scored (`5864426`, 11:08 PM).

| Reader       | Right, of 30 | Debit reports caught, of 15 | Missed | False alarms, of 15 |
| ------------ | ------------ | --------------------------- | ------ | ------------------- |
| Keyword rule | 17           | 10                          | 5      | 8                   |
| Model        | 30           | 15                          | 0      | 0                   |

A miss is the costly mistake: the payment link stays on for a customer who has already been debited. Two of the five replies the rule missed: "पहले खाते में 5000 थे अब 3752 हैं", where the balance fell by exactly the order amount, and "refund nahi chahiye mujhe. jo 1248 liye hain uska order bhej do".

The limits matter as much as the result.

- The set is 30 replies, written by one person in one evening, and built to include hard cases. It shows that a gap exists. It does not show how large the gap is on real traffic.
- The model's answers were produced by Claude in the build session, reading each reply once against the fixed prompt. They did not come from a call made by the prototype.
- The same assistant wrote the baseline and answered as the model. Fixing the rule before the replies existed rules out tuning it to the test. A stronger rule could still close part of the gap.

The files and the full protocol are in [`src/second-attempt/checks/replies/`](src/second-attempt/checks/replies/). The prototype shows all 30 replies with both readers' answers, under "The reply test" at the foot of every screen.

**Prompts worth recording.**

- To Claude, after it paused for approval before opening web pages: "please don't wait for my approval to access a webpage..since these are public, you can go ahead and do that yourself".
- To Lovable, to create the project: "Create a blank single-page app with one centered heading that says "Prototype loading". Use the default React, TypeScript and Tailwind setup. No backend, no auth."
- To ChatGPT, for the review: "I want the harshest fair review you can give. A polite review is useless to me."
- To the model in the reply test, the rule for doubt: "If a reply could reasonably be read either way, answer D. Leaving a link on for a customer who has been debited is the costly mistake." The full prompt is in [`model-prompt.md`](src/second-attempt/checks/replies/model-prompt.md).
- To Claude, after the review: "you just do whatever best that can be done for now to improve the product". Section 4 says what it then did under that instruction.

## 3. AI outputs I rejected, corrected or improved

**Where I overruled or challenged it on the idea.**

1. **A plan that depended on merchant interviews.** Before any building, Claude asked me to hold fifteen-minute merchant conversations, so that the note would carry a real number and I could test the direction against a merchant's own words. I could not reach a merchant that day. I told Claude to go ahead without them. The cost is stated, not hidden: the one-pager says the evidence is desk research with no merchant interviews, the persona is labelled as a persona, and real failure data from one merchant is the first test listed.
2. **A claim that Razorpay's material never uses the failure reason.** Claude's research said Razorpay's public material on failed payments did not mention the failure reason, and the first one-pager said so. Before recording the video I asked Claude whether the research was complete. Its re-check found a Razorpay post it had missed: Intelligent Payment Retry (February 2024), which weighs error messages and instrument downtimes inside checkout. The claim was true of the recovery posts and incomplete as a picture of the product line.
3. **A submission that claimed too much.** Before recording, I asked Claude to brief a second model for a critical review of everything that would be judged, and ran it. Three findings changed the entry.
   - It found a competitor that Claude's research had missed: Cashfree Resolve, which places an AI voice call within 60 seconds of a failed payment and opens with the likely failure reason. Claude checked this on Cashfree's own pages before I used it. The idea is now pitched as the message-based answer to that product, with two additions: deciding when not to contact a customer, and a holdout that measures the result.
   - It showed that "every failed payment gets the same link today" was an inference from marketing posts, not an established fact. The claim is gone. One link for all is now called what it is: the simplest recovery rule, used as the comparison.
   - It pressed on the headline number, which measured messaging against silence, not four lanes against one link. The comparison with one link is now on the results screen. The result the pack leads with is the smaller one: ₹14,633 more than one link over 12 simulated weeks, most of it from a single lane.
4. **A recovery path that leaned on customers replying.** The demo's central moment is a customer who replies that her money was already cut. At 3 AM before submitting I asked Claude: "do people really reply back to bank messages?!" Its answer had three parts. The message comes from the store on WhatsApp, not from a bank. It found no figure for how often customers reply to a message like this one. And the simulation had assumed that every one of the 13 affected customers replied, which the one-pager did not say. Three things changed. The retry message now carries a one-tap reply, which a rule can read, so a model is needed only for customers who type. The one-pager and the results screen state the assumption. And the gateway's late-authorisation signal is named as the trigger that needs no reply at all.

**Corrections from Claude's own verification, which I kept.** Each one changed the submission.

| First output                                                                      | What was wrong                                                                                                                                                       | What replaced it                                                                                                |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| "Failed-payment recovery is open space for a new product."                        | Research showed Razorpay already ships Failed Payment Recovery (2024) and a RAY command that sends links to all failed payers.                                       | The product became an upgrade to that rule: four lanes instead of one link.                                     |
| A prototype batch of about 130 failed payments a week, worth ₹1.9 lakh.           | That implied a quarter of sales failing for good, which is above Razorpay's own statement that 20 to 25% of payments fail and half of those customers do not return. | Volume cut to about 70 a week, roughly ₹1 lakh, tied to that statement.                                         |
| A simulated result where only 2% of held-out customers came back.                 | An unlucky random draw. It made the lift look far larger than the rates the simulation assumes.                                                                      | A fixed seed whose sample sits close to the stated assumptions, with week 1 left inconclusive.                  |
| A retry message that said "Nothing was deducted."                                 | The product cannot know that for a timeout. If the bank had debited the customer, the message would be false.                                                        | Messages now ask for a reply if money left the account. One such reply switches off the link.                   |
| A citation that said NPCI published bank decline rates.                           | The article credits NPCI only for downtime figures.                                                                                                                  | The attribution was narrowed.                                                                                   |
| Three Razorpay posts quoted as one fact on customers lost after a failed payment. | The posts say 50%, 60% and 70%, and none cites a source.                                                                                                             | All three are shown, and the figure is flagged as unverified.                                                   |
| A sentence on the first screen saying `payment_timed_out` "appeared 7 times".     | The count left out the payments that were pending or already paid. The code appeared 11 times in the sample week.                                                    | The sentence gives the true count and where each went: 5 retried at once, 2 held for a bank, 4 not asked again. |

**Corrections that came from the outside review.** Claude checked each finding against the code before changing anything.

| First output                                                                                                                    | What was wrong                                                                                                                       | What replaced it                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "25 of 68 needed context beyond the code."                                                                                      | Payments sorted with the downtime feed were counted as sorted by the code alone.                                                     | 35 are sorted by the code alone. 33 need a second fact.                                                                                                                |
| A comparison that left out customers who reported a debit after a message.                                                      | That removes people from a group after they were messaged, which flatters the result.                                                | Everyone stays in the group they were assigned to: 177 of 586 paid, not 177 of 573.                                                                                    |
| "Revenue caused" worked out as the gap in payment rates times the average payment.                                              | It assumes both groups pay the same amount each. In the simulated run the held-out customers who paid had larger carts.              | Money collected per assigned customer, with non-payers counted as zero. The 12-week figure fell from ₹1.59 lakh to ₹1.21 lakh.                                         |
| A result called proven in the first week its range cleared zero, which was week 6.                                              | Checking every week makes a false alarm likely. On the default plan the range is above zero in week 8 and back across it in week 10. | The test length is fixed in advance at 60 held-out customers and the result is read once, at the end. The range it reports is wide: ₹6,212 to ₹2,35,697.               |
| Messages that said "your bank shows ₹X as pending" and promised the money back within 5 working days, for every payment method. | The prototype cannot see what the bank shows, and I had no source for the five working days.                                         | Messages say the payment may still be processing. The line about the money coming back is kept for UPI only, where RBI's rule requires auto-reversal within five days. |
| A lane change proposed because unexplained declines paid less often than customer slips.                                        | Two different groups. The gap says nothing about which message works better for either.                                              | The screen proposes a test inside the group.                                                                                                                           |
| A message for low balance that suggested "a different UPI app".                                                                 | Another app on the same account has the same balance.                                                                                | The message offers a different bank account or card, pay later, or instalments.                                                                                        |

## 4. What AI did, and what I decided or built myself

| Area                  | Claude                                                                                                                      | Me                                                                                                                                                                                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Track and constraints |                                                                                                                             | Chose Track 2. Set the time limit: one day at first, extended into the next morning after the outside review. No merchant calls were possible in that time.                                                                                               |
| Research              | Searched, read, verified quotes, flagged weak evidence                                                                      | Told it to research directly instead of pausing for approvals. Supplied the correct brief when it flagged that I had attached the wrong file. Asked for a completeness check before recording, which surfaced a Razorpay product the research had missed. |
| Product direction     | Proposed five directions, compared them, argued against its own top pick                                                    | Chose cause-aware failed-payment recovery over the COD and reorder options.                                                                                                                                                                               |
| Product rules         | Proposed options and trade-offs                                                                                             | Chose the name. Chose that three no-discount lanes run on their own and offers wait for approval. Chose discount as a last resort only. Chose a 10% holdout by default.                                                                                   |
| Prototype             | Wrote all the code, the synthetic data and the tests                                                                        | Chose Lovable for hosting. Created the Lovable project and connected it to GitHub. Published the app, made the repository public and reviewed the live version. Rejected the first visual design as too basic and asked for the redesign.                 |
| Outside review        | Wrote the context file and the review prompt. Checked the review's claims. Proposed the fixes and made them                 | Asked for a second model's critique and ran it. Told Claude to act on the findings with its own judgment. Approved leading with the smaller result, ₹14,633 against one link.                                                                             |
| Reply test            | Wrote the keyword rule and the model's prompt before the replies existed. Answered as the model reader. Scored both readers | Wrote the 30 replies and the answer key by hand. Held the key back until both sets of answers were committed.                                                                                                                                             |
| Written deliverables  | Drafted from my decisions                                                                                                   | Own the final wording. Nothing goes into the form without my review.                                                                                                                                                                                      |

## 5. Known limitations, risks and verification

**Limitations.**

- **All data is synthetic.** The merchant, customers, payments and bank downtimes are invented. Field names follow Razorpay's public payment entity and Payment Downtime API. UPI reason codes and descriptions come from Razorpay's public UPI error documentation. Card and netbanking values are illustrative.
- **Outcomes are simulated from assumed rates.** For example, 33% of customers who slipped at the last step pay after a retry message, and 12% come back with no message. None of these rates is measured. The prototype lists every assumption under "Assumptions and what is simulated".
- **There is no model in the prototype.** The sorting is rules. The Hinglish reply on the live screen and the answer to it are written in advance. The role proposed for a language model is narrow: reading unfamiliar bank error text and customers' free-text replies, and handing structured facts to the rules. Reading replies has been tested once, on 30 replies (section 2). Reading bank error text has not been tested.
- **No merchant interviews.** The current workaround is described from Razorpay's own posts and vendor playbooks. The only merchant voice in the pack is one public forum post.
- **Nothing is sent.** There is no WhatsApp, SMS or payment link behind the prototype.
- **Replies are assumed.** In the simulation, each customer whose debit could not be seen replies to the message, and none pays twice. Real customers may stay silent, complain to their bank or in their UPI app, or pay again. No figure was found for replies to a message like this one. The design lowers its dependence on a reply in two ways: a one-tap reply under the message, and the gateway's late-authorisation signal, which the prototype does not simulate.
- **Open product questions.** The prototype does not answer what happens in an outage that lasts for hours, whose WhatsApp number sends the message, or how the feature would be priced.

**Risks.**

- Razorpay's recovery messages may already use the failure reason. Its in-checkout retry does. Public material on the messages describes a link sent to customers whose payment failed and does not say how the product decides.
- Cashfree Resolve already opens with the failure reason, on a voice call. Second Attempt's difference is narrower than I first claimed: messages and not calls, a decision on when not to contact a customer, and a holdout.
- Against no message, the simulated result is about ₹1.21 lakh over 12 weeks, in a range of ₹6,212 to ₹2,35,697. The range is wide because only 63 customers were held out. Most of that result is the effect of sending any message at all.
- Against one link for everyone, under the same assumed rates, the four lanes recover ₹2.52 lakh and one link ₹2.37 lakh: ₹14,633 more. ₹13,836 of that comes from waiting out bank downtimes. The synthetic data puts 16% of failed payments inside a downtime. NPCI's chief put UPI technical declines at 0.7 to 0.8% of all transactions in 2024, so the real share is probably lower. At 5% of failures the edge is about ₹5,000. The check is in [`src/second-attempt/checks/one-link.ts`](src/second-attempt/checks/one-link.ts) and on the results screen.
- A gap that small cannot be measured in one store. Telling the two rules apart needs about 6,600 customers in each group, and this store has about 600 in a quarter. The real test has to be pooled across merchants.
- The count of 30 misdirected links in 68 is against a simple rule that sends a link to every failed payer. Razorpay's product may already skip orders that were paid later or blocked for risk. Without those two groups the count is 15 of 68.
- A simple rules table may capture most of the value. In the synthetic week 35 of 68 failures are sorted by the reason code alone and 33 need a second fact, such as the downtime feed. Both are rules, and that split is itself an assumption.
- A failed-payment notice may not qualify as a WhatsApp utility message, which would raise message cost about sevenfold.
- Whether a pending debit can be seen when a payment is sorted is not verified. I found no such field in Razorpay's public payment record. In the prototype it is a synthetic field.
- RBI's five-day rule covers UPI payments to merchants. For cards used online I found no timeline in the circular, so the status message cites the rule for UPI only.
- Switching a payment link off relies on Razorpay's Payment Links cancel API. I could not open that documentation page on the build day, so it is not verified.

**Verification steps taken.**

- Every number taken from a source was checked by re-opening the page and copying the sentence. Unsourced company claims are labelled as such in the research notes.
- The comparison of directions and the sizing were computed in code.
- The data generator is seeded and avoids engine-dependent randomness, so every browser shows the same numbers.
- The click path was run end to end in a headless browser with zero console errors, including stop and resume, offer approval and all three result periods.
- After the move into the Lovable repository: the repository's typecheck, lint, routing test and production build pass. A script confirmed that every generated week, simulated run and message is identical to the tested version. Screenshots of each screen were compared pixel by pixel with the tested version, and the layout was checked at phone width.
- After the redesign, the same checks ran again: typecheck, lint, build, the full click path, and five screen widths. The four lane colours were run through a colour-blindness check on both the dark and the white surface.
- The published link was checked two ways. An anonymous fetch returned the page with no sign-in. The full click path then ran on the live site in a browser: every file loaded, the console stayed clean and the 12-week figures matched the tested run.
- Before the outside review, every number on the four screens was derived again from the code. That found one wrong count on the first screen and one unexplained difference between the live screen's last total and the week 1 result. The count was corrected and the difference now has a note.
- The numbers quoted in the one-pager, the video and this log are pinned to the code by two test files, [`numbers.test.ts`](src/second-attempt/checks/numbers.test.ts) and [`score.test.ts`](src/second-attempt/checks/replies/score.test.ts). `npm test` fails if the seed, the generator, an assumed rate or the reply test's result changes them.
- The competitor named by the outside review was checked on Cashfree's own blog and product page before it was cited. RBI's rule was read in the circular itself.
- The order of events in the reply test is in the commit history: the rule and the prompt, then the replies and both readers' answers, then the key.
- After the review fixes were published, the live site was checked again in a browser at 10:31 PM on 12 October: the new headline, the card that compares the lanes with one link, and the 12-week figures matched the tested build.
- After the last publish, the live site was checked again in a browser on the morning of 13 October: the one-tap reply, the second approve button, the new paragraph on replies and the 12-week figures matched the tested build.
- The one-pager's fit on a single A4 page was measured, not judged by eye.

## Sources

- Razorpay, Failed Payment Recovery (22 Feb 2024): https://razorpay.com/blog/razorpay-failed-payment-recovery/
- Razorpay, Intelligent Payment Retry (23 Feb 2024): https://razorpay.com/blog/razorpay-intelligent-payment-retry/
- Razorpay, Introducing the most effective way to recover failed payments (4 Jan 2023): https://razorpay.com/blog/introducing-the-most-effective-way-to-recover-failed-payments/
- Razorpay docs, Payment Gateway features (Checkout Retry Flow, Downtime Communication on Checkout): https://razorpay.com/docs/payments/payment-gateway/features/
- Razorpay, Meet RAY on WhatsApp (2 Sep 2026): https://razorpay.com/blog/meet-ray-your-always-on-ai-account-manager-now-live-on-whatsapp/
- Razorpay, Agent Studio: AI Agents by Razorpay (12 Mar 2026): https://razorpay.com/blog/agent-studio-ai-agents-by-razorpay/
- Razorpay, Agent Studio product page, source of the list of agents by industry: https://razorpay.com/agent-studio/
- Razorpay, Agent Studio principles, guardrails and merchant control (30 Mar 2026): https://razorpay.com/blog/razorpay-agent-studio-principles-guardrails-and-merchant-control/
- Razorpay, Agentic Dashboard (6 Oct 2025): https://razorpay.com/blog/razorpay-agentic-dashboard-your-dashboard-just-conversational-with-ray/
- Razorpay, Most Reliable Payment Gateway guide, source of the cause mix (9 Apr 2026): https://razorpay.com/blog/payment-gateway-reliability-india-businesses-2026/
- Razorpay, Payment Success Rate Optimization (5 May 2026): https://razorpay.com/blog/payment-success-rate-optimization-india/
- Razorpay docs, UPI payment errors: https://razorpay.com/docs/errors/payments/upi
- Razorpay docs, payment entity: https://razorpay.com/docs/api/payments/entity
- Razorpay docs, Payment Downtime API: https://razorpay.com/docs/payments/payment-gateway/rainy-day/downtime
- Razorpay docs, late authorisation: https://razorpay.com/docs/payments/payments/late-authorisation/handle
- Razorpay docs, payment webhooks, source of the `order.paid` event: https://razorpay.com/docs/webhooks/payloads/payments/
- Cashfree, A failed payment doesn't have to mean a lost sale (8 Sep 2026), on Cashfree Resolve: https://www.cashfree.com/blog/a-failed-payment-doesnt-have-to-mean-a-lost-sale/
- Cashfree, Agentic Payments product page: https://www.cashfree.com/agentic-payments/
- RBI, Harmonisation of Turn Around Time and customer compensation for failed transactions (20 Sep 2019), source of the five-day reversal rule for UPI: https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=11693
- Inc42, Technical Glitches On UPI Have Fallen Below 1% (20 Nov 2024), quoting NPCI's chief: https://inc42.com/buzz/technical-glitches-on-upi-have-fallen-below-1
- NPCI, definitions of business and technical declines: https://www.npci.org.in/statistics/bd-td-and-uptime
- Shopify Community (5 Apr 2021), a merchant in India on payments that were deducted with no order created: https://community.shopify.com/t/payment-deducted-order-not-captured-happening-for-a-lot-of-orders-please-help/41957
- Inc42 on Razorpay, ChatGPT Ads and Agent Studio's beta (5 Oct 2026): https://inc42.com/buzz/razorpay-partners-with-openai-to-help-indian-brands-advertise-on-chatgpt/
- Razorpay, UPI Dispute Redressal Mechanism (21 Jan 2025), which points a debited customer to the UPI app and the bank: https://razorpay.com/blog/upi-dispute-redressal-mechanism/
- Clickatell help, interactive buttons in WhatsApp message templates, source of the one-tap reply: https://help.clickatell.com/whatsapp/channel-capabilities/whatsapp-message-templates/use-interactive-buttons-in-message-templates
- Meta, WhatsApp template category guidelines: https://developers.facebook.com/docs/whatsapp/updates-to-pricing/new-template-guidelines/
- QuickReply.ai, WhatsApp pricing in India, quoting Meta's rate card: https://www.quickreply.ai/whatsapp-automation/whatsapp-business-api-pricing
- Caller Digital, AI calling cost and recovery reporting (vendor): https://caller.digital/blog/abandoned-cart-recovery-ai-calling-d2c-india-shopify-woocommerce
- Stripe docs, Smart Retries: https://docs.stripe.com/billing/revenue-recovery/smart-retries
