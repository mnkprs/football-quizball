/**
 * Realism model for the e2e game simulation.
 *
 * Called before every answer submission. Return true to submit the correct
 * answer, false to submit a realistic wrong guess. Average result over a
 * session should approach `targetAccuracy` (default 0.5), but HOW you get
 * there is up to you.
 *
 * Trade-offs to consider:
 *   • Flat coin flip → memoryless, no streaks. Cleanest analytics baseline.
 *   • Streak-biased → if lastCorrect, slight bump (realistic "hot streak")
 *     or slight dip (fatigue). Produces richer streak analytics.
 *   • Difficulty-aware → higher accuracy on EASY, lower on EXPERT. Shapes
 *     the ELO-change histogram to look like real play.
 *   • Fatigue curve → accuracy drifts down as questionIndex grows. Good
 *     for testing long-session dashboards.
 *
 * Whatever you pick, it must converge to ≈ targetAccuracy over the session
 * or your analytics will skew from the requested 50%.
 *
 * @param {{
 *   questionIndex: number,      // 0-based index within this session
 *   sessionLength: number,      // total questions expected in this session
 *   difficulty: string,         // 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT'
 *   lastCorrect: boolean|null,  // outcome of previous answer (null on Q0)
 *   correctSoFar: number,       // correct count before this answer
 *   targetAccuracy: number,     // desired session average, default 0.5
 * }} ctx
 * @returns {boolean} true → submit correct answer, false → submit wrong
 */
export function pickShouldAnswerCorrectly(ctx) {
  // TODO: implement. Placeholder flat coin-flip below — replace with your model.
  return Math.random() < ctx.targetAccuracy;
}
