import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { BattleRoyaleStore } from './battle-royale.store';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-battle-royale-lobby',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './battle-royale-lobby.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BattleRoyaleLobbyComponent {
  protected store = inject(BattleRoyaleStore);
  private router = inject(Router);
  auth = inject(AuthService);

  loading = signal(false);
  error = signal<string | null>(null);
  inviteCode = '';

  async createRoom(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    const roomId = await this.store.createRoom();
    this.loading.set(false);
    if (roomId) {
      this.router.navigate(['/battle-royale', roomId]);
    } else {
      this.error.set(this.store.error() ?? 'Failed to create room');
    }
  }

  async joinQueue(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    const roomId = await this.store.joinQueue();
    this.loading.set(false);
    if (roomId) {
      this.router.navigate(['/battle-royale', roomId]);
    } else {
      this.error.set(this.store.error() ?? 'Failed to find a room');
    }
  }

  async joinByCode(): Promise<void> {
    if (!this.inviteCode.trim()) return;
    this.loading.set(true);
    this.error.set(null);
    const roomId = await this.store.joinByCode(this.inviteCode.trim().toUpperCase());
    this.loading.set(false);
    if (roomId) {
      this.router.navigate(['/battle-royale', roomId]);
    } else {
      this.error.set(this.store.error() ?? 'Room not found');
    }
  }

  goBack(): void {
    this.router.navigate(['/']);
  }
}
