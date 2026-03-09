import { Component, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-invite',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  template: `
    <div class="invite-page">
      <div class="invite-content">
        <div class="invite-hero">
          <div class="invite-emoji">🤝</div>
          <h1 class="invite-title">Invite a Friend</h1>
          <p class="invite-subtitle">
            Share the link so they can try football trivia.
          </p>
        </div>

        <div class="invite-actions">
          <button
            mat-flat-button
            color="primary"
            class="invite-btn invite-btn-primary"
            (click)="copyLink()"
          >
            <span class="material-icons">content_copy</span>
            {{ copied() ? 'Copied!' : 'Copy link' }}
          </button>

          @if (canShare()) {
            <button
              mat-stroked-button
              class="invite-btn"
              (click)="share()"
            >
              <span class="material-icons">share</span>
              Share via...
            </button>
          }
        </div>

        <div class="invite-steps">
          <h3 class="invite-steps-title">How it works</h3>
          <ol class="invite-steps-list">
            <li>
              <span class="invite-step-num">1</span>
              <span>Share the link with a friend</span>
            </li>
            <li>
              <span class="invite-step-num">2</span>
              <span>They open it and try the app</span>
            </li>
            <li>
              <span class="invite-step-num">3</span>
              <span>Play 2-player head-to-head on the same device</span>
            </li>
          </ol>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .invite-page {
      min-height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }

    .invite-content {
      max-width: 28rem;
      width: 100%;
    }

    .invite-hero {
      text-align: center;
      margin-bottom: 2.5rem;
    }

    .invite-emoji {
      font-size: 4rem;
      line-height: 1;
      margin-bottom: 1rem;
    }

    .invite-title {
      font-size: 1.75rem;
      font-weight: 800;
      margin: 0 0 0.5rem 0;
      color: var(--mat-sys-on-surface);
    }

    .invite-subtitle {
      font-size: 1rem;
      color: var(--mat-sys-on-surface-variant);
      margin: 0;
      line-height: 1.5;
    }

    .invite-actions {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .invite-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 1rem 1.5rem !important;
      font-size: 1.0625rem !important;
      font-weight: 600 !important;
    }

    .invite-btn .material-icons {
      font-size: 1.25rem;
    }

    .invite-btn-primary {
      font-weight: 700 !important;
    }

    .invite-steps {
      margin-top: 2.5rem;
      padding: 1.5rem;
      border-radius: 1rem;
      background: var(--mat-sys-surface-container-low, rgba(0, 0, 0, 0.03));
      border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.08));
    }

    .invite-steps-title {
      font-size: 0.8125rem;
      font-weight: 600;
      margin: 0 0 1rem 0;
      color: var(--mat-sys-on-surface-variant);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .invite-steps-list {
      margin: 0;
      padding: 0;
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .invite-steps-list li {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-size: 0.9375rem;
      color: var(--mat-sys-on-surface);
    }

    .invite-step-num {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 1.5rem;
      height: 1.5rem;
      border-radius: 50%;
      background: var(--mat-sys-primary);
      color: var(--mat-sys-on-primary);
      font-size: 0.75rem;
      font-weight: 700;
      flex-shrink: 0;
    }
  `],
})
export class InviteComponent {
  copied = signal(false);

  get inviteUrl(): string {
    return typeof window !== 'undefined'
      ? window.location.origin
      : '';
  }

  canShare(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.share;
  }

  async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.inviteUrl);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = this.inviteUrl;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }
  }

  async share(): Promise<void> {
    if (!navigator.share) return;
    try {
      await navigator.share({
        title: 'Unlimited Quizball',
        text: 'Try this football trivia app',
        url: this.inviteUrl,
      });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        this.copyLink();
      }
    }
  }
}
