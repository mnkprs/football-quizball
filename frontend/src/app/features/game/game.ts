import { Component, inject, OnInit, OnDestroy, ChangeDetectionStrategy, effect } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router } from '@angular/router';
import { GameStore } from '../../core/game.store';
import { GAME_STORE_TOKEN } from '../../core/game-store.token';
import { LanguageService } from '../../core/language.service';
import { ThemeService } from '../../core/theme.service';
import { ShellUiService } from '../../core/shell-ui.service';
import { SetupComponent } from '../setup/setup';
import { LoadingComponent } from '../setup/loading';
import { BoardComponent } from '../board/board';
import { QuestionComponent } from '../question/question';
import { ResultComponent } from '../question/result';
import { ResultsComponent } from '../results/results';

@Component({
  selector: 'app-game',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: GAME_STORE_TOKEN, useExisting: GameStore }],
  imports: [
    CommonModule,
    SetupComponent,
    LoadingComponent,
    BoardComponent,
    QuestionComponent,
    ResultComponent,
    ResultsComponent,
  ],
  templateUrl: './game.html',
  styleUrl: './game.css',
})
export class GameComponent implements OnInit, OnDestroy {
  store = inject(GameStore);
  lang = inject(LanguageService);
  private router = inject(Router);
  private location = inject(Location);
  private theme = inject(ThemeService);
  private shellUi = inject(ShellUiService);

  constructor() {
    // Mirror logo-quiz/solo/blitz pattern: shell chrome (top-nav + bottom-nav)
    // visible during the lobby (setup phase), hidden during active gameplay
    // (loading/board/question/result/finished).
    effect(() => {
      const inLobby = this.store.phase() === 'setup';
      this.shellUi.hideBottomNav.set(!inLobby);
      this.shellUi.showTopNavBar.set(inLobby);
    });
  }

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.theme.resetToDark();
    this.shellUi.hideBottomNav.set(false);
    this.shellUi.showTopNavBar.set(false);
  }

  goBack(): void {
    this.location.back();
  }
}
