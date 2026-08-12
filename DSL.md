# The DSL reference

Eleven of the tools in this repo read a small text DSL and render from it. This is one
document you can hand to an LLM so it can author valid input for any of them. Each tool's
state lives entirely in the URL hash, so whatever the DSL produces is a bookmarkable,
shareable link — there is no backend and no account.

The six tools **without** a DSL — `flow`, `rank`, `fermi`, `alarm`, `duel`, `premortem` —
take their input through the UI (sliders, wizards, forms), not text. Don't write DSL for
them.

Jump to a tool: [paths](#paths) · [roadmap](#roadmap) · [wardley](#wardley) · [bets](#bets) ·
[timeline](#timeline) · [map](#map) · [tree](#tree) · [why](#why) · [gauge](#gauge) ·
[energy/cycles](#energycycles) · [energy/risk](#energyrisk)

---

## Shared conventions

The eleven grammars differ, but they're a family and obey the same rules:

- **Config is `key: value`, one per line.** Most tools want config lines *before* the first
  content line — `roadmap`, `wardley`, `bets`, `gauge`, `tree` and `why` warn (or re-read
  the line as content) if a config key appears after content. `timeline`, `map`,
  `energy/cycles` and `energy/risk` are order-free.
- **`//` starts a comment** — a whole line, or a trailing comment after content. Roadmap's
  atomic `basis:` provenance is the exception: `//` there invalidates the datum rather
  than being stripped.
- **Indentation is 2 spaces, and it means structure** in `bets`, `tree` and `why` (a child
  is one level deeper than its parent). The other tools read flat lines or lists; leading
  spaces there are just trimmed.
- **Parsers never throw. Mistakes come back as soft, line-numbered warnings** (`line N: …`),
  and a half-finished or partly wrong document still renders. You can paste an incomplete
  draft and iterate.
- **Numbers** are a point (`120`) or a range (`30-50`, or `30–50` with an en-dash); some
  fields take a trailing `%`.
- **`palette:`** is one of `ocean`, `slate`, `ember`, `plum`. **`accent:`** is a 6-digit hex
  like `#C05621` (it tints one accent role; the palette drives the rest).
- **`title:`** is free text on every tool.
- **`verdict:`** decides whose words lead the artefact, on the seven tools whose verdict
  is part of the exported picture (`map`, `wardley`, `timeline`, `tree`, `gauge`,
  `energy/cycles`, `energy/risk`). Leave it out and the tool writes the line, as it
  always has. `verdict: off` removes it entirely — from the artefact, the export and the
  page. Anything else is *your* line, in the tool's slot: the first number in it is
  marked as the key figure, and a line with no number carries no colour. The rule is that
  a claim on your artefact should be a claim you made — where a tool props its line up
  with a supporting sentence (`tree`'s evidence, `timeline`'s operational bits), that
  goes too, because it was explaining a line you replaced.

## What each tool supports

| Tool | `title` | `palette` | `accent` | Signature config keys | Signature node syntax |
|---|---|---|---|---|---|
| [paths](#paths) | ✓ | ✓ | ✓ | `date` `today` `style` `verdict` | `decision name:` blocks, period headers, then `Lane: Item [status] [if/unless] -- note -> url` |
| [roadmap](#roadmap) | ✓ | ✓ | ✓ | `date` `headline` `story` `horizons` `wip` `fade` `style` `focus` `verdict` `group` `basis` | `HORIZON` header, then `Lane: Item [status] [bet:/if/unless] -- note -> url xN` |
| [wardley](#wardley) | ✓ | ✓ | ✓ | `anchor` `verdict` | `Name @ stage` and `A -> B -> C` edges |
| [bets](#bets) | ✓ | ✓\* | ✓\* | `unit` | indent 0 group / 2 `Bet: stake N, odds N-N%, payoff N-N` / 4 `kill:` |
| [timeline](#timeline) | ✓ | ✓ | ✓ | `today` `verdict` | `Lane: Label DATE [.. DATE] [status] // note` |
| [map](#map) | ✓ | ✓ | ✓ | `preset` `x` `y` `zones` `verdict` | `Label @ x,y :: field: value`, plus `zone …:` directives |
| [tree](#tree) | ✓ | ✓ | ✓ | `currency` `verdict` | indented tree; `Label (p=…) : value` |
| [why](#why) | ✓ | ✓ | ✓ | — | indented tree; `outcome:` / `? assumption` / `Solution [status]` |
| [gauge](#gauge) | ✓ | ✓ | ✓ | `names` `verdict` | `Question :: prob` / `:: range unit` / `:: chips A \| B` |
| [energy/cycles](#energycycles) | ✓ | ✓ | ✓ | `battery` `spread` `charge` `drift` `rte` `fade` `calendar` `cycles` `second` `augment` `discount` `verdict` | numeric `key: value` sheet only |
| [energy/risk](#energyrisk) | ✓ | ✓ | ✓ | `unit` `verdict` | `merchant: LO..HI`, then `floor` / `toll` / `insure` structures |

\* Accepted but not validated: `bets` stores `palette`/`accent` without using them yet.

---

## paths

**`/paths`** — a plan that keeps its unresolved decisions visible and shows which work is
included, excluded, waiting, or following an explicit assumption.

**Config keys:** `title:`, `date:` (`YYYY-MM-DD` or `off`), `today:` (`YYYY-MM-DD`, to pin
the clock), `style:` (`tree`), `verdict:` (authored text or `off`), `palette:`,
and `accent:`.

**Decision blocks:** `decision name:` at column zero, with two-space-indented fields.
`question:`, `signal:`, `owner:` and `answer-by:` describe the question; `reading:` records
the current evidence. `when:` makes a decision open only under another condition.
`answer: yes|no [date] [target: value] [actual: value] [-- receipt]` records reality.
`assume: yes|no YYYY-MM-DD` records a working assumption, which takes effect only after the
due date and never becomes a known answer.

**Plan items:** a column-zero period heading opens a section. Its two-space-indented items
are `Lane: Title [status] [if expression] -- note -> url`. Status is `done`, `doing`, `risk`
or `blocked`; expressions use one uniform `and` or `or`, with optional `not`. `[unless x]`
is an alias for `[if not x]`.

```dsl tool=paths
title: Habitat — winter paths
date: 2026-12-22
today: 2026-12-22
style: tree
verdict: Keep the fallback visible until pricing is answered
palette: ocean
accent: #C05621

decision groups:
  question: Do people add at least three friends to a habit without prompting?
  signal: invites per user >= 3
  reading: 3.4 in the winter cohort
  owner: growth squad
  answer-by: 2026-12-15
  answer: yes 2026-12-15 target: 3 actual: 3.4 -- winter cohort

decision pricing:
  question: Will coaches accept a 20% fee?
  signal: signed coaches >= 10
  owner: marketplace
  answer-by: 2026-12-15
  assume: yes 2026-12-22

decision reminders:
  question: Do reminders lift day-7 retention?
  signal: retention lift >= 15%
  owner: core squad
  answer-by: 2026-12-10
  answer: no 2026-12-10

decision marketplace:
  when: groups and pricing
  question: Can supply support a January launch?
  signal: available coaches >= 20
  owner: marketplace
  answer-by: 2027-01-20

NOW
  Core: Streak repair [doing]
  Growth: Group challenges [if groups] [done]
LATER
  Core: Reminder fallback [unless reminders] [risk]
  Growth: Coach pricing [if pricing] [blocked]
  Growth: Marketplace launch [if marketplace]
  Growth: Supply preparation [if groups and pricing]
```

## roadmap

**`/roadmap`** — a now/next/later product roadmap: items in horizon columns, optional
swimlanes, WIP limits, and a deck export.

**Config keys** (put them above the first horizon header):
- `title:` free text.
- `date:` deck date, free text; `date: off` hides it.
- `headline:` the standfirst under the title, free text. Never generated — if you want one,
  write one. It appears on **every** export (chart, board, register, focus, and the markdown).
- `story:` one authored line about what changed, printed under the standfirst and shown
  **only while a snapshot comparison is active** — it is a claim about a diff, so with no
  diff there is nothing for it to be about. The tool detects *what* moved; this is where you
  say *why*.
- `horizons:` either a comma list of 2–8 names (default `Now, Next, Later`), or a generator:
  `horizons: quarterly from Q3 2026 x4` or `horizons: monthly from Aug 2026 x6`. A generated
  (time) axis is what enables `xN` spans.
- `wip:` a number (default 6) or `off` — the per-column work-in-progress limit; a breach is
  an editor warning, not a slide.
- `fade:` anything other than `off` turns on the certainty fade for later horizons.
- `palette:` / `accent:` — as above.
- `style:` deck layout, one of `board`, `focus`, `register`, `grid`.
- `focus:` which horizon is the hero of the `focus` style (case-insensitive); defaults to the
  first non-empty horizon when absent, blank, or naming no real horizon.
- `verdict:` — `off` to carry no verdict at all, or your own line to replace the tool's. Omit it and the tool writes one, as it always has.
- `group:` the register's grouping lens, `lane` (default) or `outcome`: `group: outcome`
  regroups the register into either-way / only-if-a-bet-pays-off / only-if-it-doesn't / not-needed
  sections instead of by horizon. Affects only the `register` style — elsewhere it warns.
- `basis:` identifies a delivery projection made from one exact Paths world. It is absent
  on an ordinary roadmap and atomic when present:
  `basis: paths "Growth decisions"; answered pricing=yes@2026-08-03; assumed groups=no@2026-08-12`.
  `answered` means a written answer in Paths; `assumed` means a choice accepted only for
  planning. Each decision key can appear once across both comma-separated ledgers, and
  every entry carries a real ISO date. Any malformed or duplicate part discards the whole
  basis rather than retaining partial provenance. To keep the fixed deck header fully
  readable, source labels are capped at 80 characters, keys at 32 characters, and the
  two ledgers together at 8 entries.

**Node syntax:**
- A line equal to a horizon name (case-insensitive, trailing `:` optional) opens that
  **column**: `NOW`, `Next`, `Later`.
- Under a column, each line is an **item**: `[Lane:] Title [status] [-- note] [-> url] [xN]`.
  - `Lane:` optional swimlane prefix (`Platform: …`).
  - `[status]` one of `[done]`, `[doing]`, `[risk]`, `[blocked]` (with a few aliases).
  - `[bet: name]` flags this item as a fork point (`name` is letters/digits/hyphens only);
    `[bet: name won]` / `[bet: name lost]` writes the resolution once reality answers — a
    written resolution always beats a bare declaration, whatever order the lines are in.
    `[if name]` / `[unless name]` make an item conditional on that bet paying off (or not);
    at most one condition per item.
  - `-- note` trailing annotation; `-> url` a link; `xN` spans N columns (time axis only).

**Worlds.** Each bet is unresolved, won or lost until you write a resolution. A bet whose
own item is dropped (its condition failed) reads **moot** — "never ran", never "lost" — and
its `[if]` dependents drop the same way (`never ran`, not a claimed loss) while its
`[unless]` fallbacks stay **live** (a bet that never ran certainly didn't pay off). `[done]`
always outranks the fork: a finished item never ghosts or drops, though it warns if it's
itself *conditioned* on a bet that's still unresolved, lost, or never ran — the past can't be
conditional.

**What it warns about:** unknown palette / bad accent / bad `wip` / unknown `style`; a config
line placed after the first header (read as a lane item); header typos; items before any
header (skipped); an unknown `[status]`; a span used without a time axis; a bet name that
isn't letters/digits/hyphens; a reserved bet name (`won`/`lost`); a duplicate `[bet: x]`
declaration; conflicting `won` + `lost` resolutions (reads unresolved); a second condition on
one item; an unknown outcome word; a condition naming a bet that doesn't exist (with a
"did you mean" suggestion when a declared bet's name is within edit distance 1); an item
conditioning on its own bet (condition dropped); near-miss forms `[bet x]` / `[if: x]`
(missing colon/space); a bet nothing conditions on; a conditioned item in the first horizon
(a maybe in the commitment column); a conditioned item in an earlier horizon than its bet;
`[done]` conditioned on an unresolved, lost, or never-ran bet; `[doing]` on a dropped item;
a cascade cycle (reads unresolved); a malformed or duplicate `basis:` datum (the whole
projection basis is ignored).

```dsl tool=roadmap
title: Team roadmap
headline: We are betting the quarter on retention
story: We chose depth over breadth after the pilot
palette: ocean
horizons: Now, Next, Later
wip: 6
style: focus
focus: Later
NOW
Platform: Onboarding revamp [doing] -- cut signup steps
NEXT
Platform: Enterprise SSO
Platform: Retention engine [bet: retention]
Platform: Proactive nudges [if retention]
Later
Billing: Usage-based pricing
Billing: Manual outreach fallback [unless retention]
```

## wardley

**`/wardley`** — a Wardley map: value-chain components placed on the evolution axis, with
vertical position *derived* from the dependency edges (anchors at the top).

**Config keys** (`title` / `palette` / `accent` must come before any content):
- `title:` / `palette:` / `accent:` — as above.
- `verdict:` — `off` to carry no verdict at all, or your own line to replace the tool's. Omit it and the tool writes it, as before.
- `anchor:` a user-need name at the top of the chain. This behaves like content (you can
  have several), and **a map needs at least one** — omit it and the parser adds "User need"
  and warns.

**Node syntax:**
- `Name @ stage` where stage is `genesis`, `custom`, `product` or `commodity` — or a precise
  position `Name @ 0.83` (a number 0–1).
- `A -> B -> C` an edge chain meaning "A needs B, B needs C". Chains welcome; depth is
  derived from these.
- A bare `Name` with no `@` renders as a ghost and warns until you place it — so a
  warning-free map positions every non-anchor node.

**What it warns about:** config after content; duplicate component; an edge with an empty end
or a self-dependency; an unknown stage word; a position outside 0–1 (clamped); an
unpositioned (ghost) node; an undeclared edge endpoint (auto-ghosted); no `anchor:` line.

```dsl tool=wardley
title: Checkout
verdict: Buy the payments layer
palette: ocean
anchor: User need
Storefront @ product
Payments @ commodity
User need -> Storefront -> Payments
```

## bets

**`/bets`** — a portfolio of bets grouped into board lanes; each bet carries stake, odds,
payoff and an optional kill criterion, and drives a Monte-Carlo "P(loses money)" view.

**Config keys** (before the first group): `title:`, `unit:` (the money-unit label, e.g. `£k`),
`palette:`, `accent:`. `palette`/`accent` are accepted but not yet used.

**Node syntax** (2-space indentation is the structure):
- **Indent 0** — a **group heading** (any line that isn't a known config key; a trailing `:`
  is stripped).
- **Indent 2** — a **bet**: `Name: stake N, odds N-N%, payoff N-N`. The three attributes are
  comma-separated; each value is a point or a range (`odds` in `%`).
- **Indent 4** — `kill: free text [by YYYY-MM-DD]` — the abandon criterion; a real ISO date
  after `by` is read as the deadline.

**What it warns about:** an unknown config key; a config key after the first group; a bet
before any group (filed under an implicit "Bets"); an indented line that isn't `kill:`; a
bet missing its `: stake …, odds …, payoff …`; an unrecognised attribute or unreadable
number; odds outside 0–100%.

```dsl tool=bets
title: Q3 portfolio
unit: £k
palette: ocean
Growth bets
  Search revamp: stake 120, odds 30-50%, payoff 400-900
    kill: no lift in trial signups by 2026-09-30
  Referral loop: stake 40, odds 20-35%, payoff 150-300
```

## timeline

**`/timeline`** — a milestone timeline with honest P50–P90 date ranges, swimlanes and a
"today" line.

**Config keys** (order-free): `title:`, `palette:`, `accent:`, and `today:` a date
(`YYYY-MM` or `YYYY-MM-DD`) for the today line.
- `verdict:` — `off` carries no verdict at all; any other text becomes *your* line in the tool's verdict slot. Omit it and the tool writes one, as it always has.

**Node syntax:** each milestone is `[Lane:] Label DATE [.. DATE] [status] [// note]`.
- Dates are `YYYY-MM` (treated as mid-month) or `YYYY-MM-DD`.
- A **range** uses `..` (or an en/em-dash) between two dates — this is the P50..P90 spread.
- `[status]` is `[done]`, `[risk]` or `[fixed]`. `// note` is a trailing annotation. `Lane:`
  prefixes a swimlane. Any lane name works except `Today` and `Verdict` — those read as
  config keys, so a milestone in a lane by either name would vanish into config.
- `[fixed]` marks a date you don't control — an external event (a regulatory decision, a
  contract expiry, a conference). It renders clean with no `±?`, and the latest fixed date
  still ahead of today becomes the deadline the merge-risk verdict measures the plan against.
- A single **undone, un-fixed** date with no range warns ("claims certainty nobody has") —
  give it a `..` range, mark it `[done]`, or mark it `[fixed]`.

**What it warns about:** bad palette / accent / `today`; a line with no date; an unknown
`[status]`; unreadable or too many dates; a reversed range (swapped); a `[done]` or `[fixed]`
item with a range; a bare single future date.

```dsl tool=timeline
title: Launch plan
verdict: We hold the GA date
today: 2026-08-01
Beta cut 2026-09 .. 2026-10
Build: FID 2026-09-30 [done]
Build: GA 2026-11 .. 2027-01 [risk]
Ofgem decision 2026-12-01 [fixed]
```

## map

**`/map`** — a generic positioning matrix (assumptions, stakeholders, futures, risk, skills,
RAG): items placed at x,y on a plane, with method presets, custom axes and named zones.

**Config keys** (order-free): `title:`, `palette:`, `accent:`, plus:
- `preset:` one of `assumptions`, `stakeholders`, `futures`, `risk`, `skills`, `rag` — sets
  axes and zones for that method.
- `x:` / `y:` custom axis label, optionally with end labels: `x: Effort (low → high)`.
- `zones: grid NxM` — an N×M grid of cells (1×1 to 6×6).
- `verdict:` — `off` carries no verdict at all; any other text becomes *your* line.
- A **`zone` directive** (distinct from `zones:`): `zone 2,1: Quick wins` names a cell, or
  `zone Watch: x>50 & y>50` defines a rule-bounded zone (`x`/`y`/`x+y`/`x-y` compared with a
  number, joined by `&`).

**Node syntax:** `Label [@ x,y] [:: field: value ...] [// comment]`.
- `@ x,y` positions the item (numbers 0–100). Without a position it's unplaced until you drag
  it.
- `:: key: value` attaches fields (e.g. `:: note: from interviews`); an unrecognised field is
  kept as a note.

**What it warns about:** unknown palette / preset; a bad `zones:` spec or zone rule; a
position clamped to 0–100; a stray `@` that looks like a fumbled position; a `::` field that
isn't `key: value`; more than ~40 items (crowding).

```dsl tool=map
title: Assumptions
verdict: Test the streak claim first
preset: assumptions
Users log daily @ 30,90
Streak drives retention @ 75,80 :: note: from interviews
```

## tree

**`/tree`** — a decision tree: decision, chance and outcome nodes with cash values and
probabilities, run through a 10,000-sample EV / distribution.

**Config keys** (before any node): `title:`, `currency:` (one of `£`, `$`, `€`), `palette:`,
`accent:`.
- `verdict:` — `off` carries no verdict at all; any other text becomes *your* line in the tool's verdict slot. Omit it and the tool writes one, as it always has.

**Node syntax** (2-space indentation = one level deeper):
- Every line is `Label [(p=…)] [: value]`.
- `(p=…)` is a probability — a number, a range, or `rest` (which soaks up the remaining
  probability among its siblings).
- `: value` is money — `900k`, `-150k`, `1.2m`, a range `A to B`, with `£$€,` and `k/m/b`
  understood.
- **Node kinds are inferred**: children carrying `p=` make their parent a *chance* node;
  children without `p=` make it a *decision*; a node with no children is a *leaf* and
  **must carry a value** (a valueless leaf warns and is treated as 0).

**What it warns about:** bad currency / palette / accent; an unreadable probability or one
outside 0–1; an indent that isn't a multiple of 2; a leaf with no value; a p-less child among
probabilistic siblings.

```dsl tool=tree
title: Bid or no bid
verdict: We bid, and we bid high
currency: £
Bid decision
  Submit bid
    Win (p=0.4) : 900k
    Lose (p=rest) : -150k
  Walk away : 0
```

## why

**`/why`** — an opportunity-solution tree: outcomes → opportunities → solutions →
assumptions, which also projects into a now/next/later roadmap view.

**Config keys** (before any node): `title:`, `palette:`, `accent:`.

**Node syntax** (2-space indentation = one level deeper; kind is inferred from the prefix):
- `outcome: Label` — a root outcome.
- A plain indented line — an **opportunity**.
- `Label [status]` where status is `candidate`, `testing`, `delivering`, `shipped` or
  `parked` — a **solution**.
- `? Label [status]` where status is `untested`, `testing`, `holds` or `broken` — an
  **assumption**; assumptions sit under a solution.

**What it warns about:** unknown palette / accent; an odd indent; an unknown assumption or
solution status; a top-level line that isn't an `outcome:` (treated as one); an assumption
not under a solution; a solution nested under a solution.

```dsl tool=why
title: Retention
outcome: Improve 30-day retention
  Users forget mid-afternoon habits
    Smart reminders [testing]
      ? users want reminders [holds]
```

## gauge

**`/gauge`** — a live estimation session: a **list of questions** the room answers privately,
revealed together. Not a diagram — the DSL is a questionnaire (up to 20 questions).

**Config keys** (before the first question): `title:`, `names:` (`on` or `off` — `off` is
anonymous, the default), `palette:`, `accent:`.
- `verdict:` — `off` carries no verdict at all; any other text becomes *your* line in the tool's verdict slot. Omit it and the tool writes one, as it always has.

**Node syntax:** each question is `Question text :: type`, where type is:
- `prob` — a probability (0–100%).
- `range unit` — a numeric 90% range; give it a **unit** (`range weeks`) or it warns.
- `chips A | B | C` — a pick from 2–8 `|`-separated options.

**What it warns about:** a config key after the first question; `names` not `on`/`off`; a line
that isn't `text :: type`; missing question text; a `range` with no unit; empty or duplicate
chips, or fewer than 2 / more than 8; an unknown type; more than 20 questions.

```dsl tool=gauge
title: Q3 review
verdict: The room is split on shipping
names: off
We ship by Q3 :: prob
Weeks to migrate :: range weeks
Biggest risk :: chips Scope | Staffing | Tech debt
```

## energy/cycles

**`/energy/cycles`** — battery-storage cycle-budget economics: an order-free sheet of numeric
parameters fed to a Monte-Carlo engine. There is no node structure — every line is
`key: value`. Uses the fictional "Wexcombe" BESS as the house example.

**Config keys** (order-free; six are required):
- Required: `battery: 100MW / 200MWh`; `spread:` (day-ahead £/MWh spread, point or range);
  `rte:` round-trip efficiency %; `fade:` degradation per cycle; `calendar:` calendar fade
  %/yr; `cycles: 6000 over 15yr` (throughput warranty).
- Recommended (each auto-warns if omitted): `charge:` charging cost, and `drift:` the
  year-on-year spread drift %.
- `verdict:` — `off` carries no verdict at all; any other text becomes *your* line
  (it governs the threshold band, cycles' one display verdict).
- Optional: `second:` second-cycle capture %, `augment:` augmentation cost (£/kWh),
  `discount:` discount rate % (default 8), plus `title:`, `palette:`, `accent:`.
- Values are a number or a `lo..hi` range; `%` fields are read as percentages.

**What it warns about:** an unreadable line or unknown key; a bad `battery` / `cycles` format;
a range that wants a number (or an inverted one, swapped); a horizon over 30 years;
`fade: 0`; a missing `charge:` (assumes ≈45% of spread) or `drift:` line.

```dsl tool=energy/cycles
title: Wexcombe cycle budget
verdict: The warranty binds before the wear does
battery: 100MW / 200MWh
spread: 35..85
charge: 15..45
drift: -4..0
rte: 86..90
fade: 0.006..0.012
calendar: 1.0..1.8
cycles: 6000 over 15yr
```

## energy/risk

**`/energy/risk`** — route-to-market comparison: a merchant revenue distribution plus
floor / toll / insurance structures, each scored as a payoff transform.

**Config keys** (order-free): `title:`, `unit:` (display label, default `£k/MW/yr`),
`palette:`, `accent:`.
- `verdict:` — `off` carries no verdict at all; any other text becomes *your* line in the tool's verdict slot. Omit it and the tool writes one, as it always has.

**Node syntax** — a required merchant range, then any of three structures (each takes an
optional trailing `"label"`):
- `merchant: LO..HI` — the merchant revenue 90% range (one per model, required).
- `floor: LEVEL [share N%] [fee N]` — a revenue floor.
- `toll: FIXED [fee N]` — a fixed tolling payment.
- `insure: premium P attach A [limit L]` — an insurance structure.

**What it warns about:** unknown palette / accent; an unrecognised line kind; a bad or
inverted merchant range; a second merchant line (ignored); a parameter not applicable to its
structure; a missing required parameter; honesty checks (a floor above P95 or below P5, an
insurance attach at the median).

```dsl tool=energy/risk
title: Route to market
verdict: Take the floor and sleep
unit: £k/MW/yr
merchant: 60..180
floor: 90 share 60% fee 5
insure: premium 8 attach 40 limit 120
```

---

*This reference is verified against the real parsers: a test parses every example above
through the tool's own `parse.js` and fails if any of them produce a warning
(`dev/dsl-doc.test.mjs`). The concepts behind the tools are in `ARCHITECTURE.md`.*

## case — the case file (binder)

One URL that holds a decision's whole kit. Config: `title:`, `question:` (the
standfirst), `status:` (`open` | `decided` | `parked`), `verdict:` (authored
only — a case never computes one; `off` carries none), `palette:`/`accent:`.
An exhibit is roadmap's link grammar: `[Lane:] Label -> url [// note]` — the
URL must be one of this suite's tools (relative `/tool/#…` or the two full
https origins); anything else stays visible as a dead (ghost) exhibit. Lanes
are free text and exist once an exhibit carries one.

```dsl tool=case
title: Wexcombe augmentation
question: Augment in 2029, or run the fleet down?
status: decided
verdict: We augment — the warranty binds 3 years before the wear does
Money: Augment NPV model -> /fermi/#abc // the £ case either way
Money: Board options -> /tree/#def
Delivery: Plan of record -> /timeline/#ghi // P50–P90 dates
Risk: Premortem register -> /premortem/#jkl
```
