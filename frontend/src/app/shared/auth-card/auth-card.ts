import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';

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
  statsText = input.required<string>();
  statsLoading = input(false);
  signOutLabel = input<string>('Sign out');

  signOut = output<void>();
  avatarError = output<void>();
}
