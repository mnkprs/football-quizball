import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ShellUiService {
  /** When true, the bottom nav bar is hidden. */
  readonly hideBottomNav = signal(false);
}
