import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ShellUiService {
  /** When true, the bottom nav bar is hidden. */
  readonly hideBottomNav = signal(false);

  /** Feature-screens opt in to showing the top-nav bar (which is otherwise
   *  only rendered on home). Logo-quiz lobby uses this. Always reset to false
   *  on the screen's ngOnDestroy. */
  readonly showTopNavBar = signal(false);
}
