import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  viewChildren,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';

export interface SoTab {
  id: string;
  label: string;
  sublabel?: string;
  /** CSS color (hex, var(...)). Defaults to --color-accent. */
  color?: string;
  /** Optional id of the <div role="tabpanel"> this tab controls (WAI-ARIA tablist). */
  controls?: string;
}

@Component({
  selector: 'so-tab-strip',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="so-tab-strip" role="tablist">
      @for (tab of tabs(); track tab.id; let i = $index) {
        <button
          #tabBtn
          type="button"
          role="tab"
          [id]="tabIdPrefix() + tab.id"
          [attr.aria-selected]="active() === tab.id"
          [attr.aria-controls]="tab.controls ?? null"
          [attr.tabindex]="active() === tab.id ? 0 : -1"
          class="so-tab-strip__tab"
          [class.so-tab-strip__tab--active]="active() === tab.id"
          [style.--tab-color]="tab.color ?? 'var(--color-accent)'"
          (click)="select(tab.id)"
          (keydown)="onKeydown($event, i)">
          <span class="so-tab-strip__label">{{ tab.label }}</span>
          @if (tab.sublabel) {
            <span class="so-tab-strip__sub">{{ tab.sublabel }}</span>
          }
        </button>
      }
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; }
    .so-tab-strip {
      display: flex; gap: 0.375rem; width: 100%;
    }
    .so-tab-strip__tab {
      flex: 1; padding: 0.625rem 0.5rem 0.5625rem;
      border: 0; cursor: pointer; border-radius: 0.6875rem;
      text-align: center; background: transparent;
      box-shadow: inset 0 -2px 0 rgba(255,255,255,0.05);
      transition: background 120ms, box-shadow 120ms;
      -webkit-tap-highlight-color: transparent;
    }
    .so-tab-strip__tab:focus-visible {
      outline: 2px solid var(--tab-color, var(--color-accent));
      outline-offset: 2px;
    }
    .so-tab-strip__tab--active {
      background: rgba(255,255,255,0.05);
      box-shadow: inset 0 -2px 0 var(--tab-color, var(--color-accent));
    }
    .so-tab-strip__label {
      display: block;
      font-family: var(--font-numeric);
      font-weight: 700; font-size: 0.75rem;
      letter-spacing: 0.08em;
      color: var(--color-fg-muted);
    }
    .so-tab-strip__tab--active .so-tab-strip__label { color: var(--tab-color, var(--color-accent)); }
    .so-tab-strip__sub {
      display: block; margin-top: 0.125rem;
      font-family: var(--font-headline);
      font-size: 0.5625rem; letter-spacing: 0.02em;
      color: var(--color-fg-muted);
    }
  `],
})
export class SoTabStripComponent {
  tabs = input.required<SoTab[]>();
  active = input.required<string>();
  /** Optional prefix used to build unique DOM ids per tab — useful when >1 tab-strip on a page. */
  tabIdPrefix = input<string>('sotab-');
  activeChange = output<string>();

  private tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('tabBtn');

  select(id: string) {
    if (id !== this.active()) {
      this.activeChange.emit(id);
    }
  }

  onKeydown(event: KeyboardEvent, index: number) {
    const tabs = this.tabs();
    const count = tabs.length;
    let nextIndex = index;
    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (index + 1) % count;
        break;
      case 'ArrowLeft':
        nextIndex = (index - 1 + count) % count;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = count - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const nextBtn = this.tabButtons()[nextIndex]?.nativeElement;
    nextBtn?.focus();
    this.activeChange.emit(tabs[nextIndex].id);
  }
}
