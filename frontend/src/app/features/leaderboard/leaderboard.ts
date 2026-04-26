import { Component, inject, signal, computed, OnInit, OnDestroy, ChangeDetectionStrategy, HostListener } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { LanguageService } from '../../core/language.service';
import { ShellUiService } from '../../core/shell-ui.service';
import { RefreshService } from '../../core/refresh.service';
import {
  LeaderboardApiService,
  LeaderboardEntry,
  LogoQuizLeaderboardEntry,
  LogoQuizHardcoreLeaderboardEntry,
  DuelLeaderboardEntry,
} from '../../core/leaderboard-api.service';
import { MatIconModule } from '@angular/material/icon';
import { ErrorStateComponent } from '../../shared/error-state/error-state';
import { SoTabStripComponent, SoTab } from '../../shared/ui/so-tab-strip/so-tab-strip';
import { LbSectionComponent } from './lb-section/lb-section';
import { toRows, meToRow, type LeaderboardRow } from './leaderboard-row';

interface LegendTier {
  readonly label: string;
  readonly range: string;
  readonly color: string;
  readonly gradientFrom: string;
  readonly icon: string;
}

type LeaderboardTab = 'solo' | 'logoQuiz' | 'duel';

const LEGEND_SEEN_KEY = 'leaderboard_legend_seen';

// Keep in sync with elo-tier.ts tier definitions
const LEGEND_TIERS: readonly LegendTier[] = [
  { label: 'GOAT',          range: '2400+',       color: '#e8ff7a', gradientFrom: '#c4d94a', icon: '🐐' },
  { label: "Ballon d'Or",   range: '2000 – 2399', color: '#eab308', gradientFrom: '#ca8a04', icon: '🥇' },
  { label: 'Starting XI',   range: '1650 – 1999', color: '#2563eb', gradientFrom: '#1d4ed8', icon: '🎽' },
  { label: 'Pro',           range: '1300 – 1649', color: '#10b981', gradientFrom: '#059669', icon: '⚽' },
  { label: 'Substitute',    range: '1000 – 1299', color: '#94a3b8', gradientFrom: '#64748b', icon: '🪑' },
  { label: 'Academy',       range: '750 – 999',   color: '#b45309', gradientFrom: '#92400e', icon: '🎒' },
  { label: 'Sunday League', range: '500 – 749',   color: '#6b7280', gradientFrom: '#4b5563', icon: '🥾' },
] as const;

// Duel parent tab now exclusively shows Logo Duel (standard duel only stores
// W-L and isn't ranked — its leaderboard was removed). The id stays 'duel' to
// avoid churning the LeaderboardTab type, only the user-facing label changes.
const MODE_TABS: SoTab[] = [
  { id: 'solo',     label: 'Solo',      color: '#10b981' },
  { id: 'logoQuiz', label: 'Logo',      color: '#a855f7' },
  { id: 'duel',     label: 'Logo Duel', color: '#a855f7' },
];

@Component({
  selector: 'app-leaderboard',
  standalone: true,
  imports: [
    RouterLink,
    MatIconModule,
    ErrorStateComponent,
    SoTabStripComponent,
    LbSectionComponent,
  ],
  templateUrl: './leaderboard.html',
  styleUrl: './leaderboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LeaderboardComponent implements OnInit, OnDestroy {
  private leaderboardApi = inject(LeaderboardApiService);
  private shellUi = inject(ShellUiService);
  private refreshSvc = inject(RefreshService);
  auth = inject(AuthService);
  lang = inject(LanguageService);

  // Raw API data (stays as signals because the API returns tagged entries and we need per-tab "me" rows).
  // Hardcore Logo Quiz signals are kept dormant — the UI doesn't bind them
  // anymore (mode is unranked/casual), but the load() call still hydrates them
  // so re-enabling the leaderboard is a template-only change. The backend
  // continues to compute hardcore ELO regardless.
  private soloEntries              = signal<LeaderboardEntry[]>([]);
  private logoQuizEntries          = signal<LogoQuizLeaderboardEntry[]>([]);
  private logoQuizHardcoreEntries  = signal<LogoQuizHardcoreLeaderboardEntry[]>([]);
  private logoDuelEntries          = signal<DuelLeaderboardEntry[]>([]);

  private soloMeEntry              = signal<(LeaderboardEntry & { rank: number }) | null>(null);
  private logoQuizMeEntry          = signal<(LogoQuizLeaderboardEntry & { rank: number }) | null>(null);
  private logoQuizHardcoreMeEntry  = signal<(LogoQuizHardcoreLeaderboardEntry & { rank: number }) | null>(null);
  private logoDuelMeEntry          = signal<(DuelLeaderboardEntry & { rank: number }) | null>(null);

  private currentUserId = computed(() => this.auth.user()?.id ?? null);

  // Normalized rows, derived once per entries update.
  soloRows             = computed<LeaderboardRow[]>(() => toRows.solo(this.soloEntries(), this.currentUserId()));
  logoQuizRows         = computed<LeaderboardRow[]>(() => toRows.logoQuiz(this.logoQuizEntries(), this.currentUserId()));
  logoQuizHardcoreRows = computed<LeaderboardRow[]>(() => toRows.logoQuizHardcore(this.logoQuizHardcoreEntries(), this.currentUserId()));
  logoDuelRows         = computed<LeaderboardRow[]>(() => toRows.duel(this.logoDuelEntries(), this.currentUserId()));

  soloMeRow             = computed<LeaderboardRow | null>(() => meToRow.solo(this.soloMeEntry(), this.currentUserId()));
  logoQuizMeRow         = computed<LeaderboardRow | null>(() => meToRow.logoQuiz(this.logoQuizMeEntry(), this.currentUserId()));
  logoQuizHardcoreMeRow = computed<LeaderboardRow | null>(() => meToRow.logoQuizHardcore(this.logoQuizHardcoreMeEntry(), this.currentUserId()));
  logoDuelMeRow         = computed<LeaderboardRow | null>(() => meToRow.duel(this.logoDuelMeEntry(), this.currentUserId()));

  // Your-ranks strip visibility (any displayed mode ranked).
  hasAnyMyRank = computed(() =>
    !!(this.soloMeRow() || this.logoQuizMeRow() || this.logoDuelMeRow())
  );

  loading = signal(false);
  error = signal<string | null>(null);
  activeTab = signal<LeaderboardTab>('solo');
  showLegend = signal(false);

  readonly legendTiers = LEGEND_TIERS;
  readonly modeTabs = MODE_TABS;

  openLegend(): void {
    this.showLegend.set(true);
  }

  closeLegend(): void {
    this.showLegend.set(false);
    try { localStorage.setItem(LEGEND_SEEN_KEY, 'true'); } catch { /* quota/security errors */ }
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: Event): void {
    if (this.showLegend()) {
      event.stopPropagation();
      this.closeLegend();
    }
  }

  ngOnInit(): void {
    this.shellUi.showTopNavBar.set(true);
    // Silent refresh — re-fetch in the background without re-rendering the
    // skeleton state. PTR is for "freshen the data," not "show me the
    // initial-load experience again."
    this.refreshSvc.register(() => this.load(true));
    this.load().then(() => {
      if (this.error() === null) {
        try {
          if (!localStorage.getItem(LEGEND_SEEN_KEY)) {
            this.showLegend.set(true);
          }
        } catch { /* localStorage unavailable */ }
      }
    });
  }

  ngOnDestroy(): void {
    this.shellUi.showTopNavBar.set(false);
    this.refreshSvc.unregister();
  }

  setActiveTab(tab: string): void {
    this.activeTab.set(tab as LeaderboardTab);
  }

  async load(silent = false): Promise<void> {
    if (!silent) this.loading.set(true);
    this.error.set(null);
    try {
      await this.auth.sessionReady;
      const isLoggedIn = this.auth.isLoggedIn();
      const emptyMe = { soloMe: null, blitzMe: null, logoQuizMe: null, logoQuizHardcoreMe: null, duelMe: null, logoDuelMe: null };
      const [leaderboardRes, meRes] = await Promise.all([
        firstValueFrom(this.leaderboardApi.getLeaderboard()),
        isLoggedIn
          ? firstValueFrom(this.leaderboardApi.getMyLeaderboardEntries()).catch(() => emptyMe)
          : Promise.resolve(emptyMe),
      ]);
      this.soloEntries.set(leaderboardRes.solo ?? []);
      this.logoQuizEntries.set(leaderboardRes.logoQuiz ?? []);
      // Hardcore entries hydrated but not displayed — see signal comment above.
      this.logoQuizHardcoreEntries.set(leaderboardRes.logoQuizHardcore ?? []);
      this.logoDuelEntries.set(leaderboardRes.logoDuel ?? []);
      this.soloMeEntry.set(meRes.soloMe ?? null);
      this.logoQuizMeEntry.set(meRes.logoQuizMe ?? null);
      this.logoQuizHardcoreMeEntry.set(meRes.logoQuizHardcoreMe ?? null);
      this.logoDuelMeEntry.set(meRes.logoDuelMe ?? null);
    } catch {
      this.error.set(this.lang.t().lbLoadFailed);
    } finally {
      if (!silent) this.loading.set(false);
    }
  }
}
