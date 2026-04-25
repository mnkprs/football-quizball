import { Component, OnInit, OnDestroy, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { BattleRoyaleStore } from './battle-royale.store';
import { BattleRoyaleApiService } from './battle-royale-api.service';
import { AuthService } from '../../core/auth.service';
import { EmptyStateComponent } from '../../shared/empty-state/empty-state';
import { ErrorStateComponent } from '../../shared/error-state/error-state';
import { LobbyHeaderComponent } from '../../shared/lobby-header/lobby-header';
import { ShellUiService } from '../../core/shell-ui.service';

export interface BRPublicRoom {
  id: string;
  inviteCode: string;
  playerCount: number;
  maxPlayers: number;
  createdAt: string;
  hostUsername: string;
}

@Component({
  selector: 'app-battle-royale-lobby',
  standalone: true,
  imports: [CommonModule, FormsModule, EmptyStateComponent, ErrorStateComponent, LobbyHeaderComponent],
  templateUrl: './battle-royale-lobby.html',
  styleUrl: './battle-royale-lobby.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BattleRoyaleLobbyComponent implements OnInit, OnDestroy {
  protected store = inject(BattleRoyaleStore);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private location = inject(Location);
  private api = inject(BattleRoyaleApiService);
  private shellUi = inject(ShellUiService);
  auth = inject(AuthService);
  isTeamLogoMode = signal(false);

  loading = signal(false);
  error = signal<string | null>(null);
  showPlaySheet = signal(false);
  rooms = signal<BRPublicRoom[]>([]);
  inviteCode = '';

  private pollTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    const mode = this.route.snapshot.queryParamMap.get('mode');
    if (mode === 'team_logo') {
      this.isTeamLogoMode.set(true);
    }

    this.shellUi.showTopNavBar.set(true);

    // Team Logo mode is invite-only (private rooms), so no public rooms to browse
    if (!this.isTeamLogoMode()) {
      this.fetchRooms();
      // Poll every 10 seconds — simple and sufficient for a lobby list
      this.pollTimer = setInterval(() => this.fetchRooms(), 10_000);
    }
  }

  ngOnDestroy(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.shellUi.showTopNavBar.set(false);
  }

  private async fetchRooms(): Promise<void> {
    try {
      const list = await firstValueFrom(this.api.getPublicRooms());
      this.rooms.set(list);
    } catch {
      // Silently ignore — room list failing shouldn't block the lobby
    }
  }

  openPlaySheet(): void {
    this.showPlaySheet.set(true);
    this.error.set(null);
  }

  closePlaySheet(): void {
    this.showPlaySheet.set(false);
  }

  async quickJoin(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    const roomId = await this.store.joinQueue();
    this.loading.set(false);
    if (roomId) {
      this.closePlaySheet();
      this.router.navigate(['/battle-royale', roomId]);
    } else {
      this.error.set(this.store.error() ?? 'Failed to find a room');
    }
  }

  async createPrivateRoom(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    const roomId = this.isTeamLogoMode()
      ? await this.store.createTeamLogoRoom()
      : await this.store.createRoom();
    this.loading.set(false);
    if (roomId) {
      this.closePlaySheet();
      this.router.navigate(['/battle-royale', roomId]);
    } else {
      this.error.set(this.store.error() ?? 'Failed to create room');
    }
  }

  async joinByCode(): Promise<void> {
    if (!this.inviteCode.trim()) return;
    this.loading.set(true);
    this.error.set(null);
    const roomId = await this.store.joinByCode(this.inviteCode.trim().toUpperCase());
    this.loading.set(false);
    if (roomId) {
      this.closePlaySheet();
      this.router.navigate(['/battle-royale', roomId]);
    } else {
      this.error.set(this.store.error() ?? 'Room not found');
      this.inviteCode = '';
    }
  }

  async joinRoom(inviteCode: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    const roomId = await this.store.joinByCode(inviteCode.toUpperCase());
    this.loading.set(false);
    if (roomId) {
      this.router.navigate(['/battle-royale', roomId]);
    } else {
      this.error.set(this.store.error() ?? 'Room not found');
    }
  }

  getTimeAgo(dateStr: string): string {
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  }

  goBack(): void {
    this.location.back();
  }
}
