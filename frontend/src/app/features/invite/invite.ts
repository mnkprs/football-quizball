import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { LanguageService } from '../../core/language.service';

@Component({
  selector: 'app-invite',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './invite.html',
  styleUrl: './invite.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InviteComponent {
  lang = inject(LanguageService);
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
