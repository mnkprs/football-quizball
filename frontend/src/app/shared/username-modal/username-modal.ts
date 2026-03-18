import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UsernameModalService } from '../../core/username-modal.service';
import { ProfileApiService } from '../../core/profile-api.service';

@Component({
  selector: 'app-username-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './username-modal.html',
  styleUrl: './username-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
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
