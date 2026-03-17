import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UsernameModalService } from '../../core/username-modal.service';
import { ProfileApiService } from '../../core/profile-api.service';

@Component({
  selector: 'app-username-modal',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="um-backdrop" aria-hidden="true"></div>

    <div class="um-card" role="dialog" aria-modal="true" aria-label="Choose your username">
      <div class="um-icon">⚽</div>
      <h2 class="um-title">Choose Your Username</h2>
      <p class="um-subtitle">Pick a unique name to identify you on the leaderboard</p>

      <form (ngSubmit)="submit()" class="um-form">
        <div class="um-field">
          <input
            type="text"
            class="um-input"
            [class.um-input--error]="fieldError()"
            [(ngModel)]="username"
            name="username"
            placeholder="e.g. FootballFan99"
            minlength="3"
            maxlength="20"
            autocomplete="username"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
            (input)="onInput()"
          />
          <p class="um-hint" [class.um-hint--error]="fieldError()">
            {{ fieldError() ?? '3–20 characters, letters, numbers, underscores only' }}
          </p>
        </div>

        @if (serverError()) {
          <p class="um-error">{{ serverError() }}</p>
        }

        <button type="submit" class="um-btn" [disabled]="loading() || !isValid()">
          @if (loading()) {
            <span>Saving…</span>
          } @else {
            <span>Save Username</span>
          }
        </button>
      </form>
    </div>
  `,
  styles: [`
    :host {
      position: fixed;
      inset: 0;
      z-index: 300;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      animation: um-in 0.2s ease;
    }

    @keyframes um-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }

    .um-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(4px);
    }

    .um-card {
      position: relative;
      width: 100%;
      max-width: 22rem;
      background: var(--color-card, #1a1a1a);
      border-radius: 1.25rem;
      padding: 2rem 1.5rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      animation: um-scale 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    @keyframes um-scale {
      from { opacity: 0; transform: scale(0.92); }
      to   { opacity: 1; transform: scale(1); }
    }

    .um-icon {
      font-size: 2.5rem;
      margin-bottom: 0.25rem;
    }

    .um-title {
      font-size: 1.25rem;
      font-weight: 800;
      margin: 0;
      color: var(--mat-sys-on-surface, #fff);
      text-align: center;
    }

    .um-subtitle {
      font-size: 0.875rem;
      color: var(--color-muted-foreground);
      margin: 0 0 0.75rem;
      text-align: center;
      line-height: 1.5;
    }

    .um-form {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .um-field {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }

    .um-input {
      width: 100%;
      padding: 0.875rem 1rem;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--color-border, rgba(255,255,255,0.12));
      border-radius: 0.75rem;
      color: var(--color-foreground, #fff);
      font-size: 1rem;
      outline: none;
      transition: border-color 0.15s;
      box-sizing: border-box;
    }

    .um-input:focus {
      border-color: var(--color-accent, #22c55e);
    }

    .um-input--error {
      border-color: var(--color-loss, #ef4444) !important;
    }

    .um-hint {
      font-size: 0.75rem;
      color: var(--color-muted-foreground);
      margin: 0;
    }

    .um-hint--error {
      color: var(--color-loss, #ef4444);
    }

    .um-error {
      font-size: 0.875rem;
      color: var(--color-loss, #ef4444);
      text-align: center;
      margin: 0;
    }

    .um-btn {
      width: 100%;
      padding: 0.9rem 1.5rem;
      background: var(--color-accent, #22c55e);
      color: #000;
      border: none;
      border-radius: 0.875rem;
      font-size: 1rem;
      font-weight: 700;
      cursor: pointer;
      transition: opacity 0.15s;
      min-height: 3.25rem;
    }

    .um-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .um-btn:hover:not(:disabled) {
      opacity: 0.88;
    }
  `],
})
export class UsernameModalComponent {
  private modalService = inject(UsernameModalService);
  private profileApi = inject(ProfileApiService);

  username = '';
  loading = signal(false);
  fieldError = signal<string | null>(null);
  serverError = signal<string | null>(null);

  private readonly PATTERN = /^[a-zA-Z0-9_]+$/;

  onInput(): void {
    this.serverError.set(null);
    const v = this.username.trim();
    if (v.length > 0 && v.length < 3) {
      this.fieldError.set('At least 3 characters required');
    } else if (!this.PATTERN.test(v) && v.length > 0) {
      this.fieldError.set('Only letters, numbers, and underscores');
    } else {
      this.fieldError.set(null);
    }
  }

  isValid(): boolean {
    const v = this.username.trim();
    return v.length >= 3 && v.length <= 20 && this.PATTERN.test(v);
  }

  async submit(): Promise<void> {
    if (!this.isValid() || this.loading()) return;
    this.serverError.set(null);
    this.loading.set(true);
    try {
      await this.profileApi.setUsername(this.username.trim());
      this.modalService.close();
    } catch (err: any) {
      const status = err?.status ?? err?.error?.statusCode;
      if (status === 409) {
        this.serverError.set('Username already taken — try another');
      } else {
        this.serverError.set(err?.error?.message ?? err?.message ?? 'Something went wrong');
      }
    } finally {
      this.loading.set(false);
    }
  }
}
