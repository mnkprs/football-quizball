import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { OnlineGameApiService } from '../../core/online-game-api.service';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-join-invite',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen bg-background flex items-center justify-center p-4">
      <div class="max-w-sm w-full text-center">
        <div class="text-5xl mb-4">⚽</div>
        <h1 class="text-2xl font-black text-foreground mb-2">QuizBall 1v1</h1>

        @if (loading()) {
          <p class="text-muted-foreground">Loading invite...</p>
        } @else if (error()) {
          <div class="bg-loss/10 border border-loss/50 rounded-2xl p-6 mt-4">
            <p class="text-loss font-bold">{{ error() }}</p>
            <button (click)="goHome()" class="mt-4 px-6 py-2 rounded-xl bg-accent text-accent-foreground font-bold">Go Home</button>
          </div>
        } @else if (preview()) {
          <div class="bg-card border border-border rounded-2xl p-6 mt-4">
            <p class="text-muted-foreground text-sm mb-1">{{ preview()!.hostUsername }} has invited you to play</p>
            @if (preview()!.status !== 'waiting') {
              <p class="text-loss font-bold mt-3">This game is no longer available ({{ preview()!.status }}).</p>
              <button (click)="goHome()" class="mt-4 px-6 py-2 rounded-xl bg-accent text-accent-foreground font-bold">Go Home</button>
            } @else {
              <div class="text-3xl font-black text-accent tracking-[0.3em] font-mono mt-3">{{ inviteCode() }}</div>
              <button
                (click)="join()"
                [disabled]="joining()"
                class="mt-6 w-full py-4 rounded-2xl bg-accent text-accent-foreground font-black text-lg hover:bg-accent-light transition disabled:opacity-40"
              >
                {{ joining() ? 'Joining...' : 'Join Game' }}
              </button>
              @if (joinError()) {
                <p class="text-loss text-sm mt-3">{{ joinError() }}</p>
              }
            }
          </div>
        }
      </div>
    </div>
  `,
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
