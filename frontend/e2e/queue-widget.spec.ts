import { test, expect, Page } from '@playwright/test';

/**
 * Floating duel queue widget — visual contract tests.
 *
 * Strategy: this test file uses the dev-only `window.__queueDebug` API
 * (exposed by `QueueStateService` constructor when `!environment.production`)
 * to drive the widget through its three states WITHOUT needing a real
 * matchmaking session, two test users, or a running backend.
 *
 * That covers the visual contract — the part most likely to regress on
 * design-system refactors. The full multi-player happy path is documented
 * as `test.skip` skeletons below; each requires real Supabase test users +
 * backend setup which is deferred to a follow-up (see TODOS.md once added).
 *
 * Plan: ~/.gstack/projects/mnkprs-football-quizball/instashop-main-design-20260426-114852.md
 * Test plan: ~/.gstack/projects/mnkprs-football-quizball/instashop-main-eng-review-test-plan-20260426-115500.md
 */

/** Open the home page and assert __queueDebug is exposed (dev mode sanity). */
async function openWithDebug(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => {
    return typeof (window as { __queueDebug?: object }).__queueDebug === 'object';
  }, undefined, { timeout: 5000 });
}

test.describe('so-queue-widget — visual contract (driven via __queueDebug)', () => {
  test('searching state: glass background + pulse dot + elapsed counter + Leave button', async ({ page }) => {
    await openWithDebug(page);

    await page.evaluate(() => (window as { __queueDebug: { showSearching: () => void } }).__queueDebug.showSearching());

    const widget = page.locator('.so-queue-widget');
    await expect(widget).toBeVisible();
    await expect(widget).not.toHaveClass(/so-queue-widget--reserved/);

    // Pulse dot is present
    await expect(widget.locator('.so-queue-widget__dot')).toBeVisible();

    // Label format: "In queue · Logo Duel · M:SS"
    const label = widget.locator('.so-queue-widget__label');
    await expect(label).toContainText('In queue');
    await expect(label).toContainText('Logo Duel');
    await expect(label).toContainText(/\d:\d{2}/);

    // Leave button (so-button ghost)
    await expect(widget.locator('so-button')).toContainText('Leave');

    // ARIA
    await expect(widget).toHaveAttribute('role', 'status');
    await expect(widget).toHaveAttribute('aria-live', 'polite');
  });

  test('reserved state: red-tinted background + opponent name + countdown + Tap to Play', async ({ page }) => {
    await openWithDebug(page);

    await page.evaluate(() => {
      const dbg = (window as { __queueDebug: { showReserved: (n: string) => void } }).__queueDebug;
      dbg.showReserved('TestOpponent');
    });

    const widget = page.locator('.so-queue-widget');
    await expect(widget).toBeVisible();
    await expect(widget).toHaveClass(/so-queue-widget--reserved/);

    // Opponent name format: "vs TestOpponent"
    await expect(widget.locator('.so-queue-widget__opponent')).toContainText('vs TestOpponent');

    // Countdown format: "10s" (initial value)
    await expect(widget.locator('.so-queue-widget__countdown')).toContainText(/^\d+s$/);

    // Tap to Play CTA
    await expect(widget.locator('so-button')).toContainText('TAP TO PLAY');

    // ARIA shifts to assertive during reserved (interrupts screen reader)
    await expect(widget).toHaveAttribute('aria-live', 'assertive');
  });

  test('hidden state: widget removed from DOM when state is hidden', async ({ page }) => {
    await openWithDebug(page);

    // Show then hide
    await page.evaluate(() => (window as { __queueDebug: { showSearching: () => void } }).__queueDebug.showSearching());
    await expect(page.locator('.so-queue-widget')).toBeVisible();

    await page.evaluate(() => (window as { __queueDebug: { hide: () => void } }).__queueDebug.hide());
    await expect(page.locator('.so-queue-widget')).toHaveCount(0);
  });

  test('cycle: searching → reserved → hidden via __queueDebug.cycle()', async ({ page }) => {
    await openWithDebug(page);

    await page.evaluate(() => (window as { __queueDebug: { cycle: () => void } }).__queueDebug.cycle());
    await expect(page.locator('.so-queue-widget')).toBeVisible();
    await expect(page.locator('.so-queue-widget')).not.toHaveClass(/so-queue-widget--reserved/);

    await page.evaluate(() => (window as { __queueDebug: { cycle: () => void } }).__queueDebug.cycle());
    await expect(page.locator('.so-queue-widget')).toHaveClass(/so-queue-widget--reserved/);

    await page.evaluate(() => (window as { __queueDebug: { cycle: () => void } }).__queueDebug.cycle());
    await expect(page.locator('.so-queue-widget')).toHaveCount(0);
  });
});

/**
 * Multi-player happy-path E2E flows (8 from the test plan).
 *
 * Each requires real fixtures (two Supabase test users, backend running,
 * authenticated sessions). Skipped pending fixture setup. The skeleton
 * documents what each test would assert, so the work is ready to flesh out
 * once the auth/backend test infra is in place.
 *
 * To enable, see TODOS.md → "Action-button toasts" thread and add a sister
 * "Playwright multi-player fixtures" item.
 */
test.describe.skip('so-queue-widget — multi-player flows (TODO: needs fixtures)', () => {
  test('happy match — Find Duel → match found → both accept → /duel/:id', async () => {
    // Two browser contexts, both authenticated as different test users.
    // Player A clicks Find Duel on /logo-quiz?tab=duel → widget appears.
    // Player B (delayed) clicks Find Duel → both widgets transition to reserved.
    // Both tap accept → both pages navigate to /duel/{gameId}.
  });

  test('browse-while-queueing: navigate to /profile during queue, match found there', async () => {
    // Player A starts queue, navigates to /profile. Player B joins.
    // Widget on /profile transitions to reserved state. Player A taps from /profile.
    // Both navigate to /duel/{gameId}.
  });

  test('hard-refresh restore: refresh during queue → widget reappears', async () => {
    // Player A starts queue. Trigger page.reload(). Widget should reappear
    // via QueueStateService.init() boot probe.
  });

  test('match-found ignored → "Match expired" toast + -5 ELO server-side', async () => {
    // Two players match. Neither taps accept within 10s. Both see Match
    // expired toast. Verify elo_history rows for both players (-5 each).
  });

  test('partial accept: only one player accepts → opponent gets forfeit', async () => {
    // Player A accepts, Player B doesn't. After 10s, Player B is abandoned
    // with -5 ELO. Player A sees a re-queue prompt.
  });

  test('two-tab same user: tab A starts queue, tab B sees widget within 2s poll', async () => {
    // Single user, two browser tabs. Tab A starts queue. Tab B reloads (or
    // waits a poll cycle) and sees the same widget state.
  });

  test('two-tab same user leave: tab A leaves, tab B widget disappears next poll', async () => {
    // Tab A taps Leave. Tab B's widget disappears within 2s.
  });

  test('cross-mode exclusivity: in logo queue, attempt standard → rejection toast', async () => {
    // Player A in logo queue. Navigate to /duel?mode=standard, tap Random Opponent.
    // Backend returns 409 with "already in a queue" message. Toast surfaces it.
  });
});
