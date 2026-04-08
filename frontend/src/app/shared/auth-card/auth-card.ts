import { Component, input, output, ChangeDetectionStrategy, computed } from '@angular/core';

@Component({
  selector: 'app-auth-card',
  standalone: true,
  templateUrl: './auth-card.html',
  styleUrl: './auth-card.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthCardComponent {
  avatarUrl = input<string | null>(null);
  avatarLoadFailed = input(false);
  displayName = input.required<string>();
  initials = input.required<string>();
  /** Legacy single-string stats — still accepted, parsed into chips */
  statsText = input.required<string>();
  statsLoading = input(false);
  signOutLabel = input<string>('Sign out');

  signOut = output<void>();
  avatarError = output<void>();

  /** Parse "ELO 1050 · Rank #3 · Blitz best 42" into structured chips */
  parsedStats = computed(() => {
    const raw = this.statsText();
    if (!raw) return [];
    return raw.split('·').map(s => s.trim()).filter(Boolean);
  });

  /** Extract the ELO number from parsedStats[0] for the tier color ring */
  elo = computed(() => {
    const chunk = this.parsedStats()[0] ?? '';
    const match = chunk.match(/\d+/);
    return match ? parseInt(match[0], 10) : 1000;
  });

  tierColor = computed(() => {
    const elo = this.elo();
    if (elo >= 2400) return '#e8ff7a';
    if (elo >= 2000) return '#a855f7';
    if (elo >= 1650) return '#06b6d4';
    if (elo >= 1300) return '#f59e0b';
    if (elo >= 1000) return '#94a3b8';
    if (elo >= 750)  return '#b45309';
    return '#6b7280';
  });

  tierLabel = computed(() => {
    const elo = this.elo();
    if (elo >= 2400) return 'Challenger';
    if (elo >= 2000) return 'Diamond';
    if (elo >= 1650) return 'Platinum';
    if (elo >= 1300) return 'Gold';
    if (elo >= 1000) return 'Silver';
    if (elo >= 750)  return 'Bronze';
    return 'Iron';
  });
}
