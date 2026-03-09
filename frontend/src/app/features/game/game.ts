import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { GameStore } from '../../core/game.store';
import { LanguageService } from '../../core/language.service';
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
    <div class="relative min-h-screen bg-background max-w-md mx-auto">
      @if (store.phase() === 'setup') {
        <button
          (click)="goBack()"
          class="fixed top-4 left-4 z-20 py-2 px-3 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition text-sm font-medium"
        >
          {{ lang.t().backToHome }}
        </button>
      }
      @switch (store.phase()) {
        @case ('setup') { <app-setup /> }
        @case ('loading') { <app-loading /> }
        @case ('board') { <app-board /> }
        @case ('question') { <app-question /> }
        @case ('result') { <app-result /> }
        @case ('finished') { <app-results /> }
        @default { <app-setup /> }
      }
    </div>
  `,
})
export class GameComponent {
  store = inject(GameStore);
  lang = inject(LanguageService);
  private router = inject(Router);

  goBack(): void {
    this.router.navigate(['/']);
  }
}
