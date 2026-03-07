import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameStore } from './core/game.store';
import { SetupComponent } from './features/setup/setup';
import { LoadingComponent } from './features/setup/loading';
import { BoardComponent } from './features/board/board';
import { QuestionComponent } from './features/question/question';
import { ResultComponent } from './features/question/result';
import { ResultsComponent } from './features/results/results';

@Component({
  selector: 'app-root',
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
export class App {
  store = inject(GameStore);
}
