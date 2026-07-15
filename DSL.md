# The DSL reference

Ten of the tools in this repo read a small text DSL and render from it. This is one
document you can hand to an LLM so it can author valid input for any of them. Each tool's
state lives entirely in the URL hash, so whatever the DSL produces is a bookmarkable,
shareable link — there is no backend and no account.

The six tools **without** a DSL — `flow`, `rank`, `fermi`, `alarm`, `duel`, `premortem` —
take their input through the UI (sliders, wizards, forms), not text. Don't write DSL for
them.

Jump to a tool: [roadmap](#roadmap) · [wardley](#wardley) · [bets](#bets) ·
[timeline](#timeline) · [map](#map) · [tree](#tree) · [why](#why) · [gauge](#gauge) ·
[energy/cycles](#energycycles) · [energy/risk](#energyrisk)

---

## Shared conventions

The ten grammars differ, but they're a family and obey the same rules:

- **Config is `key: value`, one per line.** Most tools want config lines *before* the first
  content line — `roadmap`, `wardley`, `bets`, `gauge`, `tree` and `why` warn (or re-read
  the line as content) if a config key appears after content. `timeline`, `map`,
  `energy/cycles` and `energy/risk` are order-free.
- **`//` starts a comment** — a whole line, or a trailing comment after content.
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

## What each tool supports

| Tool | `title` | `palette` | `accent` | Signature config keys | Signature node syntax |
|---|---|---|---|---|---|
| [roadmap](#roadmap) | ✓ | ✓ | ✓ | `date` `headline` `horizons` `wip` `fade` `style` | `HORIZON` header, then `Lane: Item [status] -- note -> url xN` |
| [wardley](#wardley) | ✓ | ✓ | ✓ | `anchor` | `Name @ stage` and `A -> B -> C` edges |
| [bets](#bets) | ✓ | ✓\* | ✓\* | `unit` | indent 0 group / 2 `Bet: stake N, odds N-N%, payoff N-N` / 4 `kill:` |
| [timeline](#timeline) | ✓ | ✓ | ✓ | `today` | `Lane: Label DATE [.. DATE] [status] // note` |
| [map](#map) | ✓ | ✓ | ✓ | `preset` `x` `y` `zones` | `Label @ x,y :: field: value`, plus `zone …:` directives |
| [tree](#tree) | ✓ | ✓ | ✓ | `currency` | indented tree; `Label (p=…) : value` |
| [why](#why) | ✓ | ✓ | ✓ | — | indented tree; `outcome:` / `? assumption` / `Solution [status]` |
| [gauge](#gauge) | ✓ | ✓ | ✓ | `names` | `Question :: prob` / `:: range unit` / `:: chips A \| B` |
| [energy/cycles](#energycycles) | ✓ | ✓\* | ✓ | `battery` `spread` `charge` `drift` `rte` `fade` `calendar` `cycles` `second` `augment` `discount` | numeric `key: value` sheet only |
| [energy/risk](#energyrisk) | ✓ | ✓ | ✓ | `unit` | `merchant: LO..HI`, then `floor` / `toll` / `insure` structures |

\* Accepted but not validated: `bets` stores `palette`/`accent` without using them yet;
`energy/cycles` accepts a `palette` name without checking it against the list.

---

## roadmap

**`/roadmap`** — a now/next/later product roadmap: items in horizon columns, optional
swimlanes, WIP limits, and a deck export.

**Config keys** (put them above the first horizon header):
- `title:` free text.
- `date:` deck date, free text; `date: off` hides it.
- `headline:` deck subtitle, free text. It is never generated — if you want one, write one.
- `horizons:` either a comma list of 2–8 names (default `Now, Next, Later`), or a generator:
  `horizons: quarterly from Q3 2026 x4` or `horizons: monthly from Aug 2026 x6`. A generated
  (time) axis is what enables `xN` spans.
- `wip:` a number (default 6) or `off` — the per-column work-in-progress limit; a breach is
  an editor warning, not a slide.
- `fade:` anything other than `off` turns on the certainty fade for later horizons.
- `palette:` / `accent:` — as above.
- `style:` deck layout, one of `board`, `focus`, `register`, `grid`.

**Node syntax:**
- A line equal to a horizon name (case-insensitive, trailing `:` optional) opens that
  **column**: `NOW`, `Next`, `Later`.
- Under a column, each line is an **item**: `[Lane:] Title [status] [-- note] [-> url] [xN]`.
  - `Lane:` optional swimlane prefix (`Platform: …`).
  - `[status]` one of `[done]`, `[doing]`, `[risk]`, `[blocked]` (with a few aliases).
  - `-- note` trailing annotation; `-> url` a link; `xN` spans N columns (time axis only).

**What it warns about:** unknown palette / bad accent / bad `wip` / unknown `style`; a config
line placed after the first header (read as a lane item); header typos; items before any
header (skipped); an unknown `[status]`; a span used without a time axis.

```dsl tool=roadmap
title: Team roadmap
palette: ocean
horizons: Now, Next, Later
wip: 6
NOW
Platform: Onboarding revamp [doing] -- cut signup steps
NEXT
Platform: Enterprise SSO
Later
Billing: Usage-based pricing
```

## wardley

**`/wardley`** — a Wardley map: value-chain components placed on the evolution axis, with
vertical position *derived* from the dependency edges (anchors at the top).

**Config keys** (`title` / `palette` / `accent` must come before any content):
- `title:` / `palette:` / `accent:` — as above.
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

**Node syntax:** each milestone is `[Lane:] Label DATE [.. DATE] [status] [// note]`.
- Dates are `YYYY-MM` (treated as mid-month) or `YYYY-MM-DD`.
- A **range** uses `..` (or an en/em-dash) between two dates — this is the P50..P90 spread.
- `[status]` is `[done]` or `[risk]`. `// note` is a trailing annotation. `Lane:` prefixes a
  swimlane.
- A single **undone** date with no range warns ("claims certainty nobody has") — give it a
  `..` range, or mark it `[done]`.

**What it warns about:** bad palette / accent / `today`; a line with no date; an unknown
`[status]`; unreadable or too many dates; a reversed range (swapped); a `[done]` item with a
range; a bare single future date.

```dsl tool=timeline
title: Launch plan
today: 2026-08-01
Beta cut 2026-09 .. 2026-10
Build: FID 2026-09-30 [done]
Build: GA 2026-11 .. 2027-01 [risk]
```

## map

**`/map`** — a generic positioning matrix (assumptions, stakeholders, futures, risk, skills,
RAG): items placed at x,y on a plane, with method presets, custom axes and named zones.

**Config keys** (order-free): `title:`, `palette:`, `accent:`, plus:
- `preset:` one of `assumptions`, `stakeholders`, `futures`, `risk`, `skills`, `rag` — sets
  axes and zones for that method.
- `x:` / `y:` custom axis label, optionally with end labels: `x: Effort (low → high)`.
- `zones: grid NxM` — an N×M grid of cells (1×1 to 6×6).
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
preset: assumptions
Users log daily @ 30,90
Streak drives retention @ 75,80 :: note: from interviews
```

## tree

**`/tree`** — a decision tree: decision, chance and outcome nodes with cash values and
probabilities, run through a 10,000-sample EV / distribution.

**Config keys** (before any node): `title:`, `currency:` (one of `£`, `$`, `€`), `palette:`,
`accent:`.

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

**Node syntax:** each question is `Question text :: type`, where type is:
- `prob` — a probability (0–100%).
- `range unit` — a numeric 90% range; give it a **unit** (`range weeks`) or it warns.
- `chips A | B | C` — a pick from 2–8 `|`-separated options.

**What it warns about:** a config key after the first question; `names` not `on`/`off`; a line
that isn't `text :: type`; missing question text; a `range` with no unit; empty or duplicate
chips, or fewer than 2 / more than 8; an unknown type; more than 20 questions.

```dsl tool=gauge
title: Q3 review
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
- Optional: `second:` second-cycle capture %, `augment:` augmentation cost (£/kWh),
  `discount:` discount rate % (default 8), plus `title:`, `palette:`, `accent:`.
- Values are a number or a `lo..hi` range; `%` fields are read as percentages.

**What it warns about:** an unreadable line or unknown key; a bad `battery` / `cycles` format;
a range that wants a number (or an inverted one, swapped); a horizon over 30 years;
`fade: 0`; a missing `charge:` (assumes ≈45% of spread) or `drift:` line.

```dsl tool=energy/cycles
title: Wexcombe cycle budget
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
unit: £k/MW/yr
merchant: 60..180
floor: 90 share 60% fee 5
insure: premium 8 attach 40 limit 120
```

---

*This reference is verified against the real parsers: a test parses every example above
through the tool's own `parse.js` and fails if any of them produce a warning
(`dev/dsl-doc.test.mjs`). The concepts behind the tools are in `ARCHITECTURE.md`.*
