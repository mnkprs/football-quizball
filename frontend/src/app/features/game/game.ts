import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { GameStore } from '../../core/game.store';
import { SetupComponent } from '../setup/setup';
import { LoadingComponent } from '../setup/loading';
import { BoardComponent } from '../board/board';
import { QuestionComponent } from '../question/question';
import { ResultComponent } from '../question/result';
import { ResultsComponent } from '../results/results';

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [
    CommonModule,
    SetupComponent,
    LoadingComponent,
    BoardComponent,
    QuestionComponent,
    ResultComponent,
    ResultsComponent,
  ],
  template: `
    @switch (store.phase()) {
      @case ('setup') { <app-setup /> }
      @case ('loading') { <app-loading /> }
      @case ('board') { <app-board /> }
      @case ('question') { <app-question /> }
      @case ('result') { <app-result /> }
      @case ('finished') { <app-results /> }
      @default { <app-setup /> }
    }
  `,
})
export class GameComponent {
  store = inject(GameStore);
}
