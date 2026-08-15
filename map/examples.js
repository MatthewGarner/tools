/* House examples for the map shell. Kept outside app.js (proxy/example.js set the
   precedent) so Node can exercise the REAL first-run content: map/tests/render.test.mjs
   asserts the default example's tap rects never overlap, and while that test carried its
   own copy of the source the copy drifted from the app — the overlap check passed on text
   no user ever saw. Import it; never re-type it. */
export const EXAMPLES = [
  {name: 'Assumption map', src:
`preset: assumptions
title: Lantern — launch assumptions

Readers finish the first book they start @ 30,90 :: test: watch 5 onboarding sessions
Abandoned books drive churn @ 75,80 :: note: held in Q2 interviews
Readers want social features @ 20,55 :: test: fake-door invite flow
Push reminders feel caring, not naggy @ 35,75
Readers pay for clubs @ 15,85
Curated shelves save setup time @ 80,45
App-store reviews drive installs @ 55,25
Legal sign-off on publisher licensing
`},
  {name: 'Stakeholder grid', src:
`preset: stakeholders
title: Lantern 2.0 launch

Head of Product @ 85,90 :: attitude: champion
Finance director @ 30,85 :: attitude: sceptical
Support team lead @ 80,40
Data-privacy officer @ 40,75
App-store contact @ 55,30
Beta community @ 90,20 :: note: loud, low power, high goodwill
`},
  {name: 'Futures matrix', src:
`preset: futures
title: Lantern — 2030 worlds
x: Ebook licensing terms (loose → strict)
y: AI reading assistants (novelty → normal)
zone 1,2: Open shelf
zone 2,2: Licensed concierge
zone 1,1: Long tail
zone 2,1: Walled catalogue

Publishers bundle subscriptions @ 75,80
Big-tech reading platform launches @ 30,70
Data-portability law passes @ 80,30
Backlash against reading-goal mechanics @ 25,25
Schools standardise on one reader @ 70,65
`},
  {name: 'Skills coverage', src:
`preset: skills
title: Platform team — skills coverage

Payments integration @ 20,90 :: owner: Priya
Release pipeline @ 30,80 :: owner: Sam :: backup: Jo
Data migrations @ 15,70
Mobile build signing @ 40,85 :: owner: Jo
Design system @ 65,55
Customer analytics @ 70,40
Copywriting @ 85,25
`},
  {name: 'RAG honesty', src:
`preset: rag
title: Q3 programme — status honesty check

Billing revamp @ 25,30 :: reported: green
Mobile app parity @ 40,35 :: reported: amber
Onboarding funnel @ 75,70 :: reported: green
Data platform @ 30,60 :: reported: green
Partner API @ 80,30 :: reported: red
Help centre @ 60,75 :: reported: green
`},
  {name: 'Risk grid', src:
`preset: risk
title: Lantern 2.0 — what could sink the launch

Payment migration slips @ 60,85 :: owner: platform team
App review rejection @ 35,90 :: mitigation: pre-review with store contact
Publisher catalogue gaps @ 70,60
Notification fatigue backlash @ 55,45
iOS beta crash spike @ 25,70
Press coverage flops @ 50,25
`},
];
