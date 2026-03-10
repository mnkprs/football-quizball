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
          <p class="auth-card__stats">{{ statsText() }}</p>
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
      padding: 1rem 1.25rem;
      border-radius: 1rem;
      background: var(--mat-sys-surface-container-high, rgba(0, 0, 0, 0.05));
      border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
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
      font-weight: 600;
      font-size: 1rem;
      margin: 0 0 0.375rem 0;
      color: var(--mat-sys-on-surface);
    }

    .auth-card__stats {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.25rem 0.5rem;
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--mat-sys-primary);
      margin: 0;
    }

    .auth-card__sign-out {
      padding: 0.5rem 1rem;
      font-size: 0.875rem;
      font-weight: 500;
      border-radius: 0.5rem;
      border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.2));
      background: transparent;
      color: var(--mat-sys-on-surface-variant);
      cursor: pointer;
      transition: border-color 0.2s, color 0.2s, background 0.2s;
    }

    .auth-card__sign-out:hover {
      border-color: var(--mat-sys-error, #b3261e);
      color: var(--mat-sys-error, #b3261e);
      background: color-mix(in srgb, var(--mat-sys-error, #b3261e) 8%, transparent);
    }
  `],
})
export class AuthCardComponent {
  avatarUrl = input<string | null>(null);
  avatarLoadFailed = input(false);
  displayName = input.required<string>();
  initials = input.required<string>();
  statsText = input.required<string>();
  signOutLabel = input<string>('Sign out');

  signOut = output<void>();
  avatarError = output<void>();
}
