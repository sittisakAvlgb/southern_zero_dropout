---
name: southern-zero-dropout-platform
description: >-
  Build or extend the "Southern Zero Dropout Platform" — a trilingual
  (TH/EN/MS-Rumi) React + TypeScript + Tailwind platform for the three southern
  border provinces (Pattani, Yala, Narathiwat) that tracks children from the
  first sign of dropout risk through to a durable outcome: back in learning or
  in stable work. Covers area/province/district dashboards, an out-of-school
  children registry, individual opportunity pathways, cross-agency referrals
  with SLA and PDPA consent, and school performance. Use when creating or
  extending education risk dashboards, out-of-school registries, case referral
  pipelines, or student-360 views. Triggers: "zero dropout", "early warning",
  "นักเรียนเสี่ยงหลุด", "เด็กนอกระบบ", "เฝ้าระวัง", "สพฐ.", "ศอ.บต.", "จชต.",
  "ชายแดนใต้", "education command center".
---

# Southern Zero Dropout Platform — build & extend skill

This skill captures the architecture, conventions, and hard-won gotchas of the
platform so it can be rebuilt, extended, or re-themed consistently.

## What this system is

A platform that follows one child across four kinds of actor: the executive who
moves resources, the school that teaches them, the case owner who chases them,
and the outside agency that must supply what education cannot. **13 pages.**
North-star: *executives grasp the area in 5 seconds; case owners see who to
help today; nothing about a named child leaks upward to people who only need
totals.*

Scope is the three TOR provinces — **Pattani, Yala, Narathiwat** — 33 districts,
250 tambons, 46 pilot schools from TOR Appendix C. There is **no national or
regional level**; anything that says "ทั้งประเทศ / 77 จังหวัด" is a leftover bug.

## Tech baseline (do not deviate without reason)

- **React 18 + TypeScript (strict) + Vite**, path alias `@/ → src/`.
- **Tailwind CSS**, light theme, `darkMode: 'class'` for future dark mode.
- **Framer Motion** for animation. **ApexCharts** (`react-apexcharts`) for new
  charts — area/bar/scatter/radial with real interaction; **Recharts** remains
  in a few older pages. Custom SVG for the map, gauge, sparkline.
- **No hardcoded bilingual text in shared components.** Shared UI routes
  through `useI18n()` (`t`, `pn`, `dn`, `pick`, `lang`). Dictionaries:
  `src/i18n/translations.ts` (base) + `src/i18n/sbp.ts` (product vocabulary,
  `th` / `en` / `ms`). Page-local prose may use the file's existing
  `th ? 'ไทย' : 'EN'` idiom — match whatever the file already does.
- Fonts switch by `<body class="lang-th|lang-en">`: **Kanit** (TH) /
  **Ubuntu** (EN/MS). Defined in `index.css` + `tailwind.config.js`.

## Roles and permissions — read before touching anything auth-shaped

**Six roles** (`src/auth/roles.ts`): `obec` · `esa` · `exec` · `school` ·
`teacher` · `agency` — `ROLES` is ordered widest scope first, and both auth
screens render from it.

Province, district and tambon are **not** roles. They are the same executive job
at a different altitude, expressed as `provinceKey` / `districtKey` on the
account. Adding a role because "a district chief is different from a governor"
is the mistake this model was refactored out of.

`obec` (สพฐ.) is the one role that *did* earn a split, and the test it passed is
the one to reuse: the **work** differs, not the altitude. สพฐ. answers for school
performance and for getting children back into learning; referral to
พมจ./สธ./แรงงาน and the tambon coordination table remain the area team's
authority.

It is also the only area-wide seat that reads named children, and that is the
PDPA rule applied honestly rather than an exception to it: สพฐ. is the controller
of the student register itself (DMC, TOR ๔.๓), while ศอ.บต. is a coordinating
agency — so the ศอ.บต. seat stays on aggregates and the สพฐ. seat does not.
Territory behaves exactly as it does for `exec`: no keys means สพฐ. ส่วนกลาง
across all three provinces; add a `provinceKey` and the same role becomes a
สพม. seat.

`esa` is that same education line one tier further down — a สำนักงานเขตพื้นที่
การศึกษา reading its own เขต → อำเภอ → โรงเรียน → นักเรียน. It shares `obec`'s
nav exactly; only the territory differs, which is the model working as intended.
Its scope key is `esaKey` (`src/data/esa.ts`), the **one** tier that is not
already on a data row: rows carry an อำเภอ, never a เขต, so `inTerritory()`
resolves district → เขต through `esaOfDistrict()`. `overviewStats()` therefore
sums *districts* for an ESA account, exactly as it does for a district seat —
summing its province would report the whole จังหวัด.

Two rules, both enforced in one place:

1. **Menu** — `navFor(user)` in `roles.ts`. An `exec` with no territory (ศอ.บต.)
   gets the 7 aggregate-only screens; an `exec` with a territory gets all 12,
   including the child-level ones; `obec` and `esa` get 13 — everything except
   `/referral` and `/tambon`, plus `/decision` and `/geo`, which only they open. This
   *is* TOR ๔.๕.๕ / PDPA: access follows the
   job, not the rank. `canAccess(user, path)` takes the **user**, never a bare
   role — that is what makes the rule work.
2. **Rows** — `src/auth/scope.ts`. `useScopedData()` returns provinces,
   districts, tambons, students, oosc, schools, cases, referrals, plans, stats
   already filtered. Filtering is driven by the account's keys
   (`provinceKey` → `districtKey` → `tambonKey`), plus three role special cases:
   `teacher` (own caseload), `school` (own school), `agency` (referrals
   addressed to it). **Pages must never import raw datasets.**

`isRegional` (`isAreaWide`) = an `exec` or `obec` seat with no territory — ศอ.บต.
or สพฐ. ส่วนกลาง. It says the account is not narrowed to a province, **not** that
it is limited to aggregates; the two seats differ on that. `isExecutive` =
`exec` or `obec`
— both read rolled-up figures rather than a student sample, which is also why
`overviewStats()` sends them down the same roll-up branch.

## Design system

- **Palette:** brand blue `#2f66f6`, navy `#0f2a6b`, white. Risk scale is
  semantic and fixed: `normal #16a34a` · `watch #eab308` · `high #f97316` ·
  `critical #dc2626`.
- **Never signal by color alone** — pair with the `RISK_ICON` glyph + label
  (`RiskBadge` does this). Accessibility requirement.
- **Cards:** `rounded-2xl`, `shadow-card`, hover lift `y:-4`. Big tabular
  numbers, bold headings, generous whitespace.
- **Motion vocabulary:** KPI count-up (`AnimatedCounter`), card hover lift, map
  hover highlight, slide-in panels, page transitions, skeleton shimmer, toast,
  gauge sweep, AI typing (`TypingText`), ApexCharts entry animation
  (`easeinout`, ~800–900ms, `animateGradually`). Subtle and purposeful — never
  decorative overload.

### Dashboard composition rules (learned the hard way)

- **Do not put six equal-weight KPI cards in a row.** Rank the numbers: the one
  or two that carry the page get large type and a context line that answers
  "so what" ("10.1% ของนักเรียน 250,853 คนในพื้นที่"); the rest become a compact
  secondary panel.
- **Every chart must answer the question its own heading asks.** A "cooperation
  pulse" panel with no number about whether agencies accept work is a decoration.
- **Funnels measure stage-to-stage**, not everything against one base — five
  bars against a 250k denominator make four of them invisible.
- **Never mix two different scales on one axis** (a 0–20% risk share next to a
  0–80% coverage rate). Use a scatter with mean lines and quadrants instead.
- Cards in one row must end up the **same height**; if one grows with its data,
  make the other stretch (`h-full`) rather than deleting content.
- Long lists get **list/grid toggle + pagination** (see `SchoolPerformance.tsx`)
  rather than a silent `.slice(0, 12)` — a cap that hides 34 of 46 schools reads
  as "that's all there is".

## The decision centre (`/decision`, education-line roles only)

Map + BI + AI on one page. The rule that keeps it honest: **`src/lib/decision.ts`
computes, the model only narrates.** Priority scores (four weighted signals,
each normalised against the worst district *in the account's own scope*) and the
12-month forecast are plain arithmetic, so the page is fully usable with no
`ANTHROPIC_API_KEY` — the AI brief falls back to a computed one and labels
itself "คำนวณจากข้อมูลในระบบ" rather than erroring. Keep it that way: a demo
that goes blank without a key is worse than one that reasons out loud, and a
ranking an officer can reproduce by hand beats one only the model can explain.

Forecast assumptions live in `ASSUMPTION` and are **printed on the page**. Never
hide them — the numbers are mock, and a forecast whose assumptions are invisible
reads as authority it has not earned.

## The executive briefing card (dashboard top, executive seats only)

`ExecutiveBriefing` sits above the KPI cards on `/` for `exec`/`obec`/`esa`, and
follows the same rule as the other two AI surfaces: **`src/lib/briefing.ts`
computes, the model narrates.** No key means the card labels itself
"คำนวณจากข้อมูลในระบบ" and prints the written summary — never an error.

Two traps it exists to avoid repeating:

- **A number on this card must match the card below it.** "เด็กนอกระบบ" in the
  registry panel counts the whole registry; `stats.dropout` counts only the
  children still out. The briefing says *ยังอยู่นอกระบบ* and divides the success
  rate by the same registry total the dashboard uses, or the same screen shows
  two different truths.
- **The "how this was derived" drawer prints real arithmetic.** Change a
  denominator in `briefing.ts` and the formula string has to change with it —
  a shown formula that does not produce the number beside it is worse than
  showing none.

## Geo intelligence (`/geo`, education-line roles only)

The geographic twin of the decision centre: the **page** owns the drill path
(province → เขต → district → school) and feeds `SouthernMap` a filtered district
and school list, plus `initialFocus`/`selectedKey` so the map follows. Nothing
inside the 1,200-line map component had to change — resist the urge to move the
drill state into it, since `/risk-map` and the overview depend on its own.

`canAccess()` compares the **pathname only** — call sites pass real
destinations like `/student?id=x`, and comparing the whole string silently
denied every deep link, so the navigation just did nothing with no error.

Filter options for grade and student status are derived from the rows in scope,
never from the `GradeLevel` / `ChildStatus` enums: the 46 pilot schools are
secondary (so `STUDENTS` only ever holds ป.5–ม.5) and only four of the seven
statuses occur on enrolled children, the rest belonging to the OOS registry.
Listing the full enum hands the user options that always return zero.

Three limits are printed on the page because they are properties of the data,
not bugs to fix in the UI: real geometry stops at **province** (`PROVINCE_PATHS`
— districts and schools are pins), there is **no เขต boundary geometry** so a
เขต renders as a group of districts rather than a polygon, and the 12-month
trend is seeded mock data (`trendFor()`), stable per area but not real history.
If someone later adds district or เขต polygons, that is the one change that
would let this page draw true boundaries.

## Risk model (single source of truth: `src/lib/risk.ts`)

`score = 0.30·attendance + 0.25·academic + 0.15·behavior + 0.15·family +
0.10·wellbeing + 0.05·parent` (each sub-score 0–100).
Levels: `<40 normal`, `40–69 watch`, `70–84 high`, `≥85 critical`.
`rateToLevel(riskRate%)` maps area rates onto the same four colors.

## Data layer (`src/data`, deterministic mock)

- `geo.ts` — 3 provinces / 33 districts / 250 tambons with real lon/lat, plus
  the map projection. Changing scope starts here.
- `esa.ts` — 9 เขตพื้นที่การศึกษา (3 per province) as district groupings, the
  tier between province and district. **The boundaries are a best-effort map of
  the real สพป. เขต and the TOR does not specify them** — flagged in the file,
  correctable in one table. Note the 46 pilot schools are secondary and really
  report to สพม.; the เขต tier here is geographic, resolved from the school's
  district.
- `schools.ts` — the 46 TOR Appendix C schools. District mapping is best-effort
  and pin coordinates are derived from district centroids; both are flagged in
  the file.
- `oosc.ts` — the out-of-school registry (2,685 records), 7 discovery channels,
  confidence score, consent state. **Source of truth for every OOS total.**
- `places.ts` — rolls the registry up tambon → district → province.
- `plans.ts` (1,972) — pathway chosen by rule with a stated rationale;
  7 pathways + `undecided`.
- `referrals.ts` (4,739) — SLA clock, consent, multi-agency meetings.
- `agencies.ts` (36) — partner directory + routing rules by need type.
- `students.ts` (900) / `cases.ts` (900) — in-system children and their cases,
  ~20 per pilot school. **A student's `schoolKey` is a real `School.id`
  (`TOR-005`), not a synthetic `district-school-n`** — the school director's
  scope, the teacher's caseload and the school page all join on it, and a demo
  account whose `schoolKey`/`ownerName` matches nothing silently widens to the
  whole district.

Seeded RNG (`makeRng(hashSeed(key))`) keeps every number stable across reloads.
**To use real data:** replace the generators with fetches returning the same
types (`src/types/index.ts`). The UI is decoupled from the mock source.

## Reusable components (`src/components/ui`)

`Card`/`CardHeader` (has an `action` slot), `KPICard`, `Button`, `RiskBadge`,
`RiskGauge`, `Sparkline`, `AnimatedCounter`, `TypingText`, `Select` (native,
supports `group` → `<optgroup>`), `SearchSelect` (searchable combobox with
Thai + romanised keywords, keyboard nav, sticky group headers), `Segmented`,
`Skeleton`, `Toast` (`useToast().push`), `PageHeader`/`Breadcrumb`.
Icons are inline SVG in `components/icons.tsx`.

## The map (`src/components/map/SouthernMap.tsx`)

- Renders **all of Thailand** as a grey backdrop; only the three จชต. provinces
  are interactive (the rest is `pointer-events: none`).
- Drill-down **province → district → school** with a breadcrumb, driven by one
  `SearchSelect` ("ไปยัง") that mixes all three levels in a single list.
- **Pins are HTML overlaid on the SVG**, positioned from the current viewBox —
  not SVG elements. See the gotcha below; do not move them back.
- District pins encode three things at once: color = selected metric, size =
  student count, glyph = whether the district has a multi-agency team.

## How to add a page

1. Create `src/pages/MyPage.tsx` (default export).
2. Add a route in `src/App.tsx` and an item in
   `src/components/layout/navItems.tsx` (choose `section`).
3. **Grant it in `ROLE_NAV` / the exec nav lists** — a route with no entry is
   unreachable, which is the intended default.
4. Add shared strings to `src/i18n/sbp.ts` (`th`, `en`, and `ms` where it is
   operational vocabulary).
5. Pull data from `useScopedData()`. Never import `OOSC`, `STUDENTS`, … directly.
6. Compose from `ui/`; gate first render behind `useSimulatedLoading()` +
   `Skeleton`; include empty and loading states; wire every button to a toast
   or a navigation.
7. Responsive: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`; tables collapse to
   card lists on mobile; leave bottom padding for the mobile bottom nav.

## Gotchas that already cost a day

- **Do not rely on `AnimatePresence` exit animations** — `main.tsx` enables
  `React.StrictMode`, under which the exit callback can never fire. The child
  stays mounted forever: a stale table page, a list row that will not leave
  after you finish its work, or (worst) a closed drawer whose invisible
  backdrop keeps swallowing every click. `mode="wait"` is the most reliable way
  to reproduce it, but plain exits get stuck too.
  - swap-on-key transitions → a keyed `motion.div` with `initial`/`animate`
  - removing a list row → just remove it; animate the enter, not the exit
  - a drawer/modal → keep a `closing` state, animate to the closed position,
    unmount on a `setTimeout` matching the duration (see `OoscRegistry.tsx`)
- **A `keyframes` entry in `tailwind.config.js` is not a utility.** `shimmer`
  exists as a keyframe but only `pulse-ring`, `fade-up` and `page-rise` are
  registered under `animation`, so `animate-shimmer` compiles to nothing and the
  element just sits still. For skeletons use the `Skeleton` component (the
  `.skeleton` class in `index.css` owns the real shimmer).
- **Tailwind opacity steps are not arbitrary.** `bg-slate-900/92` generates
  nothing — the element ends up fully transparent. Use `/90`, `/95`, or an
  inline `style` background.
- **Do not scale SVG elements with nested `transform` + framer-motion.** The two
  reference different coordinate systems (`transform-box: view-box`) and deep
  zoom turns pins into black blobs. HTML overlay positioned from the viewBox is
  the fix.
- **ApexCharts radar** computes `NaN` when the y-axis is hidden; use a grouped
  bar instead.
- A 12-column grid needs an explicit span on **every** child — unspecified cards
  collapse to 1/12 and their charts become unreadable.
- HMR after editing `roles.ts` / `AuthContext.tsx` can throw
  "useAuth must be used within AuthProvider" from stale module identity.
  Full-reload before believing the error.

## Wording rules

- The success state is **"กลับเข้าเรียน / มีอาชีพ"** — not "ถึงปลายทาง", which no
  one in the field says.
- **"เด็กนอกระบบ"** counts `outOfSchool` + `unreachable` only: children the
  system knows about and has *not* yet helped. `reengaging` / `returned` /
  `working` belong to the success figure.
- **"ความครอบคลุมของแผน"** = children with an active plan ÷ known OOS children.
  It is not the success rate; they were once the same number under two names.
- Data is static demo data — label it **"ข้อมูลจำลองเพื่อสาธิต"**, never
  "real-time", until it is wired to DMC (TOR ๔.๓).

## Commands

```bash
npm install && npm run dev     # develop (http://localhost:5173)
npx tsc --noEmit               # type gate — run before every hand-off
npm run build                  # tsc -b + vite build
npm run serve                  # build + node server.mjs (AI assistant, server-side key)
```
