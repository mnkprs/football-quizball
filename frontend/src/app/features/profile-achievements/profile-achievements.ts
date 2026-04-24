import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/auth.service';
import { LanguageService } from '../../core/language.service';
import { AchievementsApiService, Achievement } from '../../core/achievements-api.service';
import { SoSectionHeaderComponent } from '../../shared/ui';

@Component({
  selector: 'app-profile-achievements',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule, SoSectionHeaderComponent],
  templateUrl: './profile-achievements.html',
  styleUrl: './profile-achievements.css',
})
export class ProfileAchievementsComponent implements OnInit {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private auth = inject(AuthService);
  private api = inject(AchievementsApiService);
  lang = inject(LanguageService);

  achievements = signal<Achievement[]>([]);
  loading = signal(true);
  selectedAchievement = signal<Achievement | null>(null);

  readonly categoryMeta: Record<string, { label: string; icon: string; order: number }> = {
    progression: { label: 'Progression', icon: '📈', order: 1 },
    milestone:   { label: 'Milestones',  icon: '🎯', order: 2 },
    consistency: { label: 'Consistency', icon: '📅', order: 3 },
    performance: { label: 'Performance', icon: '🔥', order: 4 },
    mode:        { label: 'Modes',       icon: '🎮', order: 5 },
    rank:        { label: 'Rank',        icon: '👑', order: 6 },
  };

  earned = computed(() => this.achievements().filter(a => a.earned_at).length);

  categorized = computed(() => {
    const groups = new Map<string, Achievement[]>();
    for (const a of this.achievements()) {
      const key = a.category ?? 'other';
      const list = groups.get(key) ?? [];
      list.push(a);
      groups.set(key, list);
    }
    return Array.from(groups.entries())
      .map(([key, items]) => ({
        key,
        label: this.categoryMeta[key]?.label ?? key,
        icon: this.categoryMeta[key]?.icon ?? '🏅',
        order: this.categoryMeta[key]?.order ?? 99,
        items,
        earned: items.filter(a => a.earned_at).length,
        total: items.length,
      }))
      .sort((a, b) => a.order - b.order);
  });

  async ngOnInit(): Promise<void> {
    await this.auth.sessionReady;
    const userId = this.route.snapshot.paramMap.get('userId') ?? this.auth.user()?.id ?? null;
    if (!userId) { this.loading.set(false); return; }
    try {
      const data = await firstValueFrom(this.api.getForUser(userId));
      this.achievements.set(data);
    } catch {
      this.achievements.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  progressPercent(a: Achievement): number {
    if (a.earned_at) return 100;
    if (a.target <= 0) return 0;
    return Math.round((a.current / a.target) * 100);
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  goBack(): void {
    this.router.navigate(['/profile']);
  }
}
