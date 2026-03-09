import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <div class="app-container">
      <router-outlet />
    </div>
  `,
  styles: [`
    .app-container {
      min-height: 100dvh;
      max-width: 28rem;
      margin: 0 auto;
      background: var(--mat-sys-surface);
    }
  `],
})
export class App {}
