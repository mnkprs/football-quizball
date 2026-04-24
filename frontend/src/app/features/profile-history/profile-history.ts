// ProfileHistoryComponent — full match history screen.
//
// Reached via the "See all matches" CTA on the main profile. Fetches the
// server-side match history (backend caps at 10 free / 100 Pro — see
// backend/src/match-history/match-history.service.ts#getHistory), filters
// client-side via so-tab-strip, and renders each row via so-history-row.
//
// Row tap → /match/:id (existing match-detail route). Unauthenticated users
// get bounced to /login (consistent with the current profile's behavior).

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  DestroyRef,
  OnInit,
} from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/auth.service';
import { ProService } from '../../core/pro.service';
import {
  MatchHistoryApiService,
  type MatchHistoryEntry,
} from '../../core/match-history-api.service';
import {
  SoTabStripComponent,
  type SoTab,
  SoHistoryRowComponent,
  type SoHistoryRowData,
} from '../../shared/ui';

type FilterId = 'all' | 'wins' | 'losses' | 'draws';

@Component({
  selector: 'app-profile-history',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, SoTabStripComponent, SoHistoryRowComponent],
  templateUrl: './profile-history.html',
  styleUrl: './profile-history.css',
})
export class ProfileHistoryComponent implements OnInit {
  private router = inject(Router);
  private auth = inject(AuthService);
  private pro = inject(ProService);
  private api = inject(MatchHistoryApiService);
  private destroyRef = inject(DestroyRef);

  loading = signal(true);
  error = signal<string | null>(null);
  matches = signal<MatchHistoryEntry[]>([]);
  activeFilter = signal<FilterId>('all');

  readonly filterTabs: SoTab[] = [
    { id: 'all',    label: 'ALL',    controls: 'ph-all' },
    { id: 'wins',   label: 'WINS',   controls: 'ph-wins' },
    { id: 'losses', label: 'LOSSES', controls: 'ph-losses' },
    { id: 'draws',  label: 'DRAWS',  controls: 'ph-draws' },
  ];

  currentUserId = computed(() => this.auth.user()?.id ?? null);
  isPro = computed(() => this.pro.isPro());

  /** Filtered + shaped for the so-history-row component. */
  rows = computed<Array<SoHistoryRowData & { matchId: string }>>(() => {
    const uid = this.currentUserId();
    if (!uid) return [];
    const filter = this.activeFilter();
    return this.matches()
      .map(m => this.toRow(m, uid))
      .filter(r => {
        if (filter === 'all') return true;
        if (filter === 'wins') return r.result === 'win';
        if (filter === 'losses') return r.result === 'loss';
        return r.result === 'draw';
      });
  });

  totalCount = computed(() => this.matches().length);
  filteredCount = computed(() => this.rows().length);

  /** Pro-gate hint: free users see ~10, Pro users see up to 100. */
  capHint = computed(() => (this.isPro() ? 'Last 100 matches' : 'Last 10 matches · upgrade to Pro for 100'));

  ngOnInit(): void {
    this.auth.sessionReady.then(() => this.load());
  }

  private load(): void {
    const uid = this.currentUserId();
    if (!uid) {
      // Unauth users can't have match history. Redirect to login, preserve return path.
      this.router.navigate(['/login'], { queryParams: { redirect: '/profile/history' } });
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    // Ensure Pro status is loaded so the "Last 10 / 100" cap hint is accurate on
    // deep-links (push notifications, bookmarks). Fire-and-forget — the cap hint
    // is a display nicety, not a gate on the actual data fetch.
    this.pro.ensureLoaded();
    this.api.getHistory(uid).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (list) => {
        this.matches.set(list);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load match history. Try again in a moment.');
        this.loading.set(false);
      },
    });
  }

  retry(): void { this.load(); }

  onFilterChange(id: string): void {
    if (id === 'all' || id === 'wins' || id === 'losses' || id === 'draws') {
      this.activeFilter.set(id);
    }
  }

  onRowClicked(row: SoHistoryRowData & { matchId: string }): void {
    this.router.navigate(['/match', row.matchId]);
  }

  goBack(): void {
    this.router.navigate(['/profile']);
  }

  /** Map a raw MatchHistoryEntry to the so-history-row display shape from the
   * current viewer's perspective. Battle-royale and team-logo-battle rows
   * don't have a W/L/D notion per the backend model — they're flagged as 'draw'
   * so the visual stripe stays neutral. */
  private toRow(m: MatchHistoryEntry, viewerId: string): SoHistoryRowData & { matchId: string } {
    const isBr = m.match_mode === 'battle_royale' || m.match_mode === 'team_logo_battle';
    let result: 'win' | 'loss' | 'draw';
    if (isBr) result = 'draw';                              // neutral stripe
    else if (m.winner_id === null) result = 'draw';
    else if (m.winner_id === viewerId) result = 'win';
    else result = 'loss';

    const mode = this.modeLabel(m.match_mode);
    const opponent = this.opponentName(m, viewerId);
    const score = this.formatScore(m, viewerId);

    return {
      matchId: m.id,
      mode,
      result,
      // ELO delta isn't stored on the match row — we don't have it, so fall back to 0.
      // Real ELO deltas can be surfaced in a future iteration that joins elo_history.
      elo: 0,
      score,
      opponent: opponent ?? undefined,
      time: this.formatRelativeTime(m.played_at),
      initials: mode.slice(0, 2).toUpperCase(),
    };
  }

  private modeLabel(mode: string): string {
    switch (mode) {
      case 'online':              return 'Online';
      case 'duel':                return 'Duel';
      case 'local':               return '2-Player';
      case 'battle_royale':       return 'Battle Royale';
      case 'team_logo_battle':    return 'Team Logo';
      default:                    return mode;
    }
  }

  private opponentName(m: MatchHistoryEntry, viewerId: string): string | null {
    const isBr = m.match_mode === 'battle_royale' || m.match_mode === 'team_logo_battle';
    if (isBr) return null;
    return m.player1_id === viewerId ? m.player2_username : m.player1_username;
  }

  private formatScore(m: MatchHistoryEntry, viewerId: string): string {
    const isBr = m.match_mode === 'battle_royale' || m.match_mode === 'team_logo_battle';
    if (isBr) {
      const mine = m.player1_id === viewerId ? m.player1_score : m.player2_score;
      return `${mine} pts`;
    }
    return m.player1_id === viewerId
      ? `${m.player1_score} - ${m.player2_score}`
      : `${m.player2_score} - ${m.player1_score}`;
  }

  private formatRelativeTime(iso: string): string {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const diffSec = Math.max(0, Math.floor((now - then) / 1000));
    if (diffSec < 60)        return 'just now';
    if (diffSec < 3600)      return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86_400)    return `${Math.floor(diffSec / 3600)}h ago`;
    if (diffSec < 604_800)   return `${Math.floor(diffSec / 86_400)}d ago`;
    // Beyond a week, show month/day.
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
}
