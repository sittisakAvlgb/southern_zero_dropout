// ─────────────────────────────────────────────────────────────
// One definition of "out-of-school children", used by every page.
//
// The registry holds five states for a child who has left school, and the
// roll-ups keep them in three buckets:
//
//   oosCount        outOfSchool + unreachable   still out, no plan working yet
//   reengagedCount  reengaging                  has a plan, being pulled back
//   outcomeCount    returned + working          back in learning or in work
//
// The pages used to headline `oosCount` alone as "เด็กนอกระบบ" and put
// `outcomeCount` beside it as a separate figure, so the two numbers looked like
// unrelated totals and any percentage between them was ambiguous: 747 of 1,155
// reads as 65%, while the label said 39% (which was 747 of 1,902 — the real
// denominator, a number that never appeared on screen).
//
// So: the headline is the **known** total, and it is always shown split.
// ─────────────────────────────────────────────────────────────

export interface OosParts {
  oosCount: number
  reengagedCount: number
  outcomeCount: number
}

export interface OosSplit {
  /** every child the registry knows about in this area */
  known: number
  /** still out, nothing working yet */
  stillOut: number
  /** has an active plan, on the way back */
  reengaging: number
  /** back in learning or in decent work */
  succeeded: number
  /** succeeded ÷ known, in % */
  successRate: number
  /** (reengaging + succeeded) ÷ known, in % — children with something happening */
  planCoverage: number
}

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0)

/** Split a single area or a list of them (districts, tambons, provinces). */
export function oosSplit(input: OosParts | OosParts[]): OosSplit {
  const rows = Array.isArray(input) ? input : [input]
  const stillOut = rows.reduce((s, r) => s + (r.oosCount ?? 0), 0)
  const reengaging = rows.reduce((s, r) => s + (r.reengagedCount ?? 0), 0)
  const succeeded = rows.reduce((s, r) => s + (r.outcomeCount ?? 0), 0)
  const known = stillOut + reengaging + succeeded
  return {
    known,
    stillOut,
    reengaging,
    succeeded,
    successRate: pct(succeeded, known),
    planCoverage: pct(reengaging + succeeded, known),
  }
}
