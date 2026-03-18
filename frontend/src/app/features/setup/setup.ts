import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GameStore } from '../../core/game.store';
import { LanguageService } from '../../core/language.service';
import { ThemeToggleComponent } from '../../shared/theme-toggle';

@Component({
  selector: 'app-setup',
  standalone: true,
  imports: [CommonModule, FormsModule, ThemeToggleComponent],
  templateUrl: './setup.html',
  styleUrl: './setup.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SetupComponent {
  store = inject(GameStore);
  lang = inject(LanguageService);
  player1Name = '';
  player2Name = '';

  canStart(): boolean {
    return this.player1Name.trim().length >= 2 && this.player2Name.trim().length >= 2;
  }

  async startGame(): Promise<void> {
    if (!this.canStart()) return;
    await this.store.startGame(this.player1Name.trim(), this.player2Name.trim(), this.lang.lang());
  }
}
