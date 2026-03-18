import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  message: string;
  type: 'error' | 'info' | 'success';
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private counter = 0;

  show(message: string, type: Toast['type'] = 'error', durationMs = 4000): void {
    const id = ++this.counter;
    this.toasts.update(t => [...t, { id, message, type }]);
    setTimeout(() => this.toasts.update(t => t.filter(x => x.id !== id)), durationMs);
  }
}
