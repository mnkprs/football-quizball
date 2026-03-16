import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-auth-card',
  standalone: true,
  template: `
    <div class="auth-card">
      <div class="auth-card__content">
        <div class="auth-card__avatar-wrap">
          @if (avatarUrl() && !avatarLoadFailed()) {
            <img
              [src]="avatarUrl()"
              [alt]="displayName() + ' avatar'"
              class="auth-card__avatar"
              referrerpolicy="no-referrer"
              (error)="avatarError.emit()"
            />
          } @else {
            <div class="auth-card__avatar auth-card__avatar-fallback">{{ initials() }}</div>
          }
        </div>
        <div class="auth-card__info">
          <p class="auth-card__name">{{ displayName() }}</p>
          @if (statsLoading()) {
            <div class="auth-card__stats-skeleton"></div>
          } @else {
            <p class="auth-card__stats">{{ statsText() }}</p>
          }
        </div>
        <button type="button" class="auth-card__sign-out" (click)="signOut.emit()" [attr.aria-label]="signOutLabel()">
          {{ signOutLabel() }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .auth-card {
      margin-bottom: 1.5rem;
      padding: 0.9375rem 1.125rem;
      border-radius: 1rem;
      background: color-mix(in srgb, var(--color-card, #111111) 92%, #000000 8%);
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: var(--shadow-card);
    }

    .auth-card__content {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .auth-card__avatar-wrap {
      flex-shrink: 0;
    }

    .auth-card__avatar {
      width: 3rem;
      height: 3rem;
      border-radius: 50%;
      object-fit: cover;
    }

    .auth-card__avatar-fallback {
      width: 3rem;
      height: 3rem;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--mat-sys-primary) 0%, color-mix(in srgb, var(--mat-sys-primary) 70%, #000) 100%);
      color: var(--mat-sys-on-primary);
      font-size: 0.875rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      text-transform: uppercase;
    }

    .auth-card__info {
      flex: 1;
      min-width: 0;
    }

    .auth-card__name {
      font-weight: 700;
      font-size: 1rem;
      margin: 0 0 0.25rem 0;
      letter-spacing: -0.01em;
      color: var(--mat-sys-on-surface);
    }

    .auth-card__stats {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.25rem 0.5rem;
      font-size: 0.8125rem;
      font-weight: 600;
      color: color-mix(in srgb, var(--color-accent) 80%, #ffffff 20%);
      margin: 0;
    }

    .auth-card__stats-skeleton {
      height: 0.8125rem;
      width: 12rem;
      border-radius: 0.25rem;
      background: linear-gradient(90deg, rgba(255,255,255,0.06) 25%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.06) 75%);
      background-size: 200% 100%;
      animation: shimmer 1.4s infinite;
    }

    @keyframes shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    .auth-card__sign-out {
      padding: 0.625rem 0.875rem;
      font-size: 0.8125rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      border-radius: 9999px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(255, 255, 255, 0.04);
      color: var(--mat-sys-on-surface);
      cursor: pointer;
      transition: border-color 0.2s, color 0.2s, background 0.2s;
    }

    .auth-card__sign-out:hover {
      border-color: rgba(255, 255, 255, 0.2);
      background: rgba(255, 255, 255, 0.08);
    }
  `],
})
export class AuthCardComponent {
  avatarUrl = input<string | null>(null);
  avatarLoadFailed = input(false);
  displayName = input.required<string>();
  initials = input.required<string>();
  statsText = input.required<string>();
  statsLoading = input(false);
  signOutLabel = input<string>('Sign out');

  signOut = output<void>();
  avatarError = output<void>();
}
