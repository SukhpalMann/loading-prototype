# AI build log: Second Attempt

Razorpay x ISB AI PM Build Challenge, Track 2 (Recover and Grow with AI).
Author: Sukhpal Singh Mann. Built on 12 October 2026.

Second Attempt is a concept prototype. It sorts failed payments into four lanes by cause, so each customer gets the right second attempt instead of the same payment link.

- Live prototype: https://second-attempt-recovery.lovable.app/
- Code: [`src/second-attempt/`](src/second-attempt/) in this repository

This log says which AI tools I used, how, where I overruled them, and what I decided myself.

## 1. AI tools and models used

| Tool                                  | Model                                                                     | Used for                                                                                                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude (Anthropic), in the Claude app | Claude Fable 5.1 (`claude-fable-5-1`), the model selected for the session | Decoding the challenge brief, web research, comparing product directions, writing and testing the prototype code, drafting the one-pager, the video script and this log |
| Lovable                               | Lovable's built-in agent (model not specified)                            | Creating the project scaffold from one prompt, hosting the prototype on a public link, and two-way sync with GitHub                                                     |

No API keys were needed. The prototype makes no model calls at run time. See section 5.

## 2. Key prompts, workflow and agent setup

**The master prompt.** I started with one long prompt that set Claude's role (senior AI product manager, strategy consultant, AI architect and challenge evaluator) and seven phases: decode the brief, research Razorpay and merchant problems, score the options, define the product, list what was needed from me, plan the execution, and plan the submission. It also set working rules. The ones that mattered most:

- Research before recommendations. No product ideas until Razorpay's own AI products were mapped.
- Separate evidence from assumptions, and never invent a statistic, an interview or a capability.
- Challenge my assumptions instead of agreeing with me.
- Do not build around a problem statement I have not approved.

**The workflow that followed.**

1. **Brief to checklist.** Claude turned the brief into pass or fail gates and a scoring rubric, and separated the published criteria from its own guesses about what judges value.
2. **Research with verification.** About 60 searches and page reads, covering Razorpay's blog, docs and newsroom, press, and vendor blogs. Claude then re-opened every source behind a number it planned to use and copied the sentence out again to check it.
3. **Shortlist and scoring.** Five directions scored on ten weighted dimensions. The arithmetic was run in code, not in prose.
4. **Decisions by multiple choice.** Claude put each product decision to me as a short question with its recommendation marked. I answered six: the direction, the name, what runs without approval, when a discount is allowed, how recovery is proven, and hosting.
5. **Logic before screens.** Claude wrote the data generator and the sorting and simulation logic in TypeScript first, and tested them from the command line. Screens came after the numbers were stable.
6. **Screens with a browser in the loop.** Claude built the four screens in React, drove them in a headless browser, took screenshots, and fixed what it saw.
7. **Hosting.** Lovable created the project scaffold (TanStack Start, React, TypeScript, Tailwind) and hosts the app. Claude moved the prototype into that repository through Lovable's GitHub sync, then checked the result against the version it had tested. I published it from Lovable. Section 5 lists the checks.

**Prompts worth recording.**

- To Claude, after it paused for approval before opening web pages: "please don't wait for my approval to access a webpage..since these are public, you can go ahead and do that yourself".
- To Lovable, to create the project: "Create a blank single-page app with one centered heading that says "Prototype loading". Use the default React, TypeScript and Tailwind setup. No backend, no auth."

## 3. AI outputs I rejected, corrected or improved

**Four I overruled or challenged myself.**

1. **A plan that depended on merchant interviews.** Before any building, Claude asked me to hold fifteen-minute merchant conversations, so that the note would carry a real number and I could test the direction against a merchant's own words. I could not reach a merchant that day, and that day was all the time I had. I told Claude to go ahead without them. The cost is stated, not hidden: the one-pager says the evidence is desk research with no merchant interviews, the persona is labelled as a persona, and real failure data from one merchant is the first test listed.
2. **Research split across four sub-agents.** Claude's first move on research was to hand it to four parallel sub-agents, each waiting for my approval. I declined. The pages were public, so I saw no reason to approve each step. I told it to read them directly, and it did the research in one thread.
3. **A claim that Razorpay's material never uses the failure reason.** Claude's research said Razorpay's public material on failed payments did not mention the failure reason, and the first one-pager said so. Before recording the video I asked Claude whether the research was complete. Its re-check found a Razorpay post it had missed: Intelligent Payment Retry (February 2024), which weighs error messages and instrument downtimes inside checkout. The claim was true of the recovery posts and incomplete as a picture of the product line. The one-pager, the prototype and the video script now say what the sources support: Razorpay is cause-aware inside checkout and sends one link once the customer has left. Second Attempt covers that second moment.
4. **The prototype's first look.** Claude's first design was restrained to the point of plain: a grey page, small squares and a lot of text. Once it was live I told Claude it looked basic and asked for a thorough redesign that was attractive and still functional. The second version opens on the problem itself: 68 squares, the 30 wrong links in red, which then sort into the four lanes. It adds icons, a dark console for the live week, and a chart that adds up what was caused week by week with its range. The logic and every number stayed the same, and a script confirmed it.

**Corrections Claude made to its own output, which I kept.** These came from the verification steps in the workflow, and each one changed the submission.

| First output                                                                      | What was wrong                                                                                                                                                       | What replaced it                                                                               |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| "Failed-payment recovery is open space for a new product."                        | Research showed Razorpay already ships Failed Payment Recovery (2024) and a RAY command that sends links to all failed payers.                                       | The product became an upgrade to that rule: four lanes instead of one link.                    |
| A prototype batch of about 130 failed payments a week, worth ₹1.9 lakh.           | That implied a quarter of sales failing for good, which is above Razorpay's own statement that 20 to 25% of payments fail and half of those customers do not return. | Volume cut to about 70 a week, roughly ₹1 lakh, tied to that statement.                        |
| A simulated result where only 2% of held-out customers came back.                 | An unlucky random draw. It made the lift look far larger than the rates the simulation assumes.                                                                      | A fixed seed whose sample sits close to the stated assumptions, with week 1 left inconclusive. |
| A retry message that said "Nothing was deducted."                                 | The product cannot know that for a timeout. If the bank had debited the customer, the message would be false.                                                        | Messages now ask for a reply if money left the account. One such reply switches off the link.  |
| A citation that said NPCI published bank decline rates.                           | The article credits NPCI only for downtime figures.                                                                                                                  | The attribution was narrowed.                                                                  |
| Three Razorpay posts quoted as one fact on customers lost after a failed payment. | The posts say 50%, 60% and 70%, and none cites a source.                                                                                                             | All three are shown, and the figure is flagged as unverified.                                  |

## 4. What AI did, and what I decided or built myself

| Area                   | Claude                                                                 | Me                                                                                                                                                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Track and constraints  |                                                                        | Chose Track 2. Set the rule that everything had to be finished in one day, with no merchant calls possible.                                                                                                                                               |
| Research               | Searched, read, verified quotes, flagged weak evidence                 | Told it to research directly instead of pausing for approvals. Supplied the correct brief when it flagged that I had attached the wrong file. Asked for a completeness check before recording, which surfaced a Razorpay product the research had missed. |
| Product direction      | Proposed five directions, scored them, argued against its own top pick | Chose cause-aware failed-payment recovery over the COD and reorder options.                                                                                                                                                                               |
| Product rules          | Proposed options and trade-offs                                        | Chose the name. Chose that three no-discount lanes run on their own and offers wait for approval. Chose discount as a last resort only. Chose a 10% holdout by default.                                                                                   |
| Prototype              | Wrote all the code, the synthetic data and the tests                   | Chose Lovable for hosting. Created the Lovable project and connected it to GitHub. Published the app, made the repository public and reviewed the live version. Rejected the first visual design as too basic and asked for the redesign.                 |
| One-pager, script, log | Drafted from my decisions                                              | Own the final wording. Nothing goes into the form without my review.                                                                                                                                                                                      |
| Video                  | Drafted the script and the click path                                  | Record and narrate it myself.                                                                                                                                                                                                                             |

## 5. Known limitations, risks and verification

**Limitations.**

- **All data is synthetic.** The merchant, customers, payments and bank downtimes are invented. Field names follow Razorpay's public payment entity and Payment Downtime API. UPI reason codes and descriptions come from Razorpay's public UPI error documentation. Card and netbanking values are illustrative.
- **Outcomes are simulated from assumed rates.** For example, 33% of customers who slipped at the last step pay after a retry message, and 12% come back with no message. None of these rates is measured. The prototype lists every assumption under "Assumptions and what is simulated".
- **The model's judgments are scripted.** The sorting is deterministic code that reads the same fields a model would. The Hinglish reply and the agent's answer are written in advance. In production a language model would read the long tail of bank error text and customer replies.
- **No merchant interviews.** The current workaround is described from Razorpay's own posts and vendor playbooks.
- **Nothing is sent.** There is no WhatsApp, SMS or payment link behind the prototype.

**Risks.**

- Razorpay's recovery messages may already use the failure reason. Its in-checkout retry does. Public material on the messages shows one link for all failed payers and does not mention the failure reason.
- A simple rules table may capture most of the value. The share of failures that need context is 25 of 68 in the synthetic week, and that share is itself an assumption.
- A failed-payment notice may not qualify as a WhatsApp utility message, which would raise message cost about sevenfold.
- A 10% holdout proves the lift slowly at low volume: about six weeks for a store of this size.

**Verification steps taken.**

- Every number taken from a source was checked by re-opening the page and copying the sentence. Unsourced company claims are labelled as such in the research notes.
- Scores and sizing were computed in code.
- The data generator is seeded and avoids engine-dependent randomness, so every browser shows the same numbers.
- The click path was run end to end in a headless browser with zero console errors, including stop and resume, offer approval and all three result periods.
- After the move into the Lovable repository: the repository's typecheck, lint, routing test and production build pass. A script confirmed that every generated week, simulated run and message is identical to the tested version. Screenshots of each screen were compared pixel by pixel with the tested version, and the layout was checked at phone width.
- After the redesign, the same checks ran again: typecheck, lint, build, the full click path, and five screen widths. The four lane colours were run through a colour-blindness check on both the dark and the white surface.
- The published link was checked two ways. An anonymous fetch returned the page with no sign-in. The full click path then ran on the live site in a browser: every file loaded, the console stayed clean and the 12-week figures matched the tested run.
- The numbers in the one-pager and the video script were read from the same run the prototype shows.
- The one-pager's fit on a single A4 page was measured, not judged by eye.

## Sources

- Razorpay, Failed Payment Recovery (22 Feb 2024): https://razorpay.com/blog/razorpay-failed-payment-recovery/
- Razorpay, Intelligent Payment Retry (23 Feb 2024): https://razorpay.com/blog/razorpay-intelligent-payment-retry/
- Razorpay, Introducing the most effective way to recover failed payments (4 Jan 2023): https://razorpay.com/blog/introducing-the-most-effective-way-to-recover-failed-payments/
- Razorpay docs, Payment Gateway features (Checkout Retry Flow, Downtime Communication on Checkout): https://razorpay.com/docs/payments/payment-gateway/features/
- Razorpay, Meet RAY on WhatsApp (2 Sep 2026): https://razorpay.com/blog/meet-ray-your-always-on-ai-account-manager-now-live-on-whatsapp/
- Razorpay, Agent Studio: AI Agents by Razorpay (12 Mar 2026): https://razorpay.com/blog/agent-studio-ai-agents-by-razorpay/
- Razorpay, Agent Studio principles, guardrails and merchant control (30 Mar 2026): https://razorpay.com/blog/razorpay-agent-studio-principles-guardrails-and-merchant-control/
- Razorpay, Agentic Dashboard (6 Oct 2025): https://razorpay.com/blog/razorpay-agentic-dashboard-your-dashboard-just-conversational-with-ray/
- Razorpay, Most Reliable Payment Gateway guide, source of the cause mix (9 Apr 2026): https://razorpay.com/blog/payment-gateway-reliability-india-businesses-2026/
- Razorpay, Payment Success Rate Optimization (5 May 2026): https://razorpay.com/blog/payment-success-rate-optimization-india/
- Razorpay docs, UPI payment errors: https://razorpay.com/docs/errors/payments/upi
- Razorpay docs, payment entity: https://razorpay.com/docs/api/payments/entity
- Razorpay docs, Payment Downtime API: https://razorpay.com/docs/payments/payment-gateway/rainy-day/downtime
- Razorpay docs, late authorisation: https://razorpay.com/docs/payments/payments/late-authorisation/handle
- Inc42 on Razorpay, ChatGPT Ads and Agent Studio's beta (5 Oct 2026): https://inc42.com/buzz/razorpay-partners-with-openai-to-help-indian-brands-advertise-on-chatgpt/
- Meta, WhatsApp template category guidelines: https://developers.facebook.com/docs/whatsapp/updates-to-pricing/new-template-guidelines/
- QuickReply.ai, WhatsApp pricing in India, quoting Meta's rate card: https://www.quickreply.ai/whatsapp-automation/whatsapp-business-api-pricing
- Caller Digital, AI calling cost and recovery reporting (vendor): https://caller.digital/blog/abandoned-cart-recovery-ai-calling-d2c-india-shopify-woocommerce
- Stripe docs, Smart Retries: https://docs.stripe.com/billing/revenue-recovery/smart-retries
