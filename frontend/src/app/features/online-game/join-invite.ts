import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { OnlineGameApiService } from '../../core/online-game-api.service';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-join-invite',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './join-invite.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JoinInviteComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(OnlineGameApiService);
  auth = inject(AuthService);

  loading = signal(true);
  error = signal<string | null>(null);
  preview = signal<{ hostUsername: string; status: string } | null>(null);
  joining = signal(false);
  joinError = signal<string | null>(null);
  inviteCode = signal('');

  ngOnInit(): void {
    const code = (this.route.snapshot.params['code'] as string).toUpperCase();
    this.inviteCode.set(code);
    this.loadPreview(code);
  }

  private async loadPreview(code: string): Promise<void> {
    try {
      const preview = await firstValueFrom(this.api.previewInvite(code));
      this.preview.set(preview);
    } catch {
      this.error.set('Invite link not found or expired.');
    } finally {
      this.loading.set(false);
    }
  }

  async join(): Promise<void> {
    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/login'], { queryParams: { redirect: `/join/${this.inviteCode()}` } });
      return;
    }
    this.joining.set(true);
    this.joinError.set(null);
    try {
      const game = await firstValueFrom(this.api.joinByCode(this.inviteCode()));
      this.router.navigate(['/online-game', game.id]);
    } catch (err: unknown) {
      const msg = (err as { error?: { message?: string } })?.error?.message;
      if (msg === 'MAX_ONLINE_GAMES_REACHED') {
        this.joinError.set('You already have 2 active games. Finish one first.');
      } else {
        this.joinError.set('Failed to join. The game may have already started.');
      }
    } finally {
      this.joining.set(false);
    }
  }

  goHome(): void {
    this.router.navigate(['/']);
  }
}
