-- Seed for 019_social_knowledge, generated from knowledge/*.md by build-knowledge.
-- Run once, after 019. Re-running is a no-op: an edited row is never overwritten.

insert into social_knowledge (pillar, body, updated_by) values
  ('P0', $$What DialTone is, for whom, and why. Rare by design: the material is finite, so the same
idea has to arrive from different angles rather than be restated.

## The claim

One system records the whole shift. The call becomes a ticket, the ticket becomes a check,
the check becomes a drawer count and a payroll line, and every one of them names the
person who took it.

**Never position against being a point of sale.** DialTone is one, among other things. The
claim is that it is *also* the phone, the floor, the kitchen and the books — on one menu
and one set of numbers.

## Angles, so seven posts are not one post seven times

- **By symptom.** Five logins. Four totals that disagree. The 11pm reconcile. A drawer
  eleven dollars out. The phone nobody can reach.
- **By audience.** A truck with a window and a queue. One room with a bar. A group of
  three rooms whose reports do not add up.
- **By surface.** The phone. The counter. The table. The books.
- **By what disappears.** Retyping. Reconciling. Asking the kitchen what came in.

## Framing

The reader should recognise the mess before being offered the shape. Lead with their
night, not with the system. One idea per post: positioning fails by trying to say
everything.$$, 'seed from knowledge/P0-*.md'),
  ('P1', $$The backbone pillar, and the only one with unbounded material: there is always another
specific thing an operator could do differently this week.

## The moments that cost money

These are recurring scenes, not topics. Each is a post.

- **Friday 7:15.** The dining room is full, two servers are down, and the phone rings.
  Whoever answers is the person who was already the most useful somewhere else.
- **The third ring.** A caller who waits through four rings and a fumbled greeting has
  already decided how organised the kitchen is.
- **The order taken on a pad.** Written in shorthand by someone holding two plates, then
  transcribed by someone who was not there.
- **The modifier asked twice.** The server asks, the kitchen asks again, and the guest
  answers differently the second time.
- **11pm.** The floor is wiped, one person is at the host stand with a pad, a card
  terminal receipt and a drawer that does not match. The lights stay on for that.
- **Shift handover.** What the closing person knows and the opening person does not.
- **The regular who is not recognised.** They have ordered the same thing for two years
  and have to say it again every time.
- **The call that was a party of forty.** Catering enquiries arrive through the same
  channel as a single burrito and get the same forty seconds of attention.

## Things that are true about phones in restaurants

- A phone ringing is a demand for attention from someone who cannot see how busy you are.
- Answering badly is worse than not answering: a rushed greeting tells the caller they
  are an interruption.
- The cost of a missed call is invisible in every report an operator reads. Nothing
  records the order that was never placed.
- Voicemail is a promise to call back that nobody keeps during service.

## Framing that works

Lead with the moment, not the mechanism. The reader should recognise their own night in
the first line before anything is explained. End on what changes, not on a feature name.

Avoid: advice a consultant would give. "Improve your customer experience" is not a thing
anyone can do on Tuesday.$$, 'seed from knowledge/P1-*.md'),
  ('P2', $$Advisory copy about menus. No product claims; a menu post should be useful to someone who
never buys anything.

## How a menu behaves

- **Every modifier is a question asked out loud.** An item with three required choices is
  three exchanges at the counter, on the phone, and again at the pass.
- **Item count is decision time.** A long menu is not generous, it is slow — the guest
  defers, the line stops, and the kitchen preps for everything.
- **Position beats description.** The first item in a section and the last are read; the
  middle is skimmed.
- **A special that never changes is not a special.** It is a menu item with worse
  placement.
- **Categories are promises about timing.** Anything under "Sides" is assumed to arrive
  with the main.
- **The item that sells with everything** is worth more than the item that sells most —
  it raises the ticket without adding a decision.
- **A dish nobody asks about is not safe, it is invisible.**

## Questions that make a post

- Which five items do you actually sell, and how many questions does each one force?
- Which item takes the longest to explain and how often is it ordered?
- What is on the menu because it has always been on the menu?
- Which two things are almost always ordered together, and are they near each other?
- If a first-time guest read only the first three lines, what would they order?

## Framing

Advisory and concrete: the reader should be able to do the exercise before the end of the
caption. Menus are personal — never imply the reader's menu is bad, only that some
questions are worth asking about it.$$, 'seed from knowledge/P2-*.md'),
  ('P3', $$The money pillar. Always queues for review, never auto-publishes, and **every number in a
draft must come from the fact sheet with an id**. Nothing in this file is a number, on
purpose.

## How an owner actually evaluates a cost

- They compare against what the thing replaces, not against zero.
- A monthly figure is judged against a slow Tuesday, not an average.
- A per-transaction fee is judged on the order it applies to, not on revenue.
- "What happens if I stop" is asked before "what happens if I start".
- Anything that needs hardware is a different decision from anything that does not,
  because hardware is a purchase and software is a subscription.
- A setup fee is a smaller objection than a contract.

## The shape of an honest cost post

- Name what is being compared. A price with nothing beside it is not information.
- Show the arithmetic the reader would do, using only cited figures.
- Say what is *not* included as plainly as what is.
- Never imply a saving that has not been measured. There is no figure for what a missed
  call cost, and inventing one is the fastest way to lose an operator who has run the
  numbers themselves.

## Framing

Plain and unhurried. An owner reading about money is already sceptical, and confidence
reads as pressure. The strongest move is to state a cost and let it sit.$$, 'seed from knowledge/P3-*.md')
on conflict (pillar) do nothing;
