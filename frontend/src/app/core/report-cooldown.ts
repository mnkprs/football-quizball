import { signal } from '@angular/core';

export interface ReportCooldown {
  readonly disabled: ReturnType<typeof signal<boolean>>;
  readonly reported: ReturnType<typeof signal<boolean>>;
  /** Call before making the API request. Starts the 60s cooldown. */
  start(): void;
  /** Call on API success. */
  markReported(): void;
  /** Call on API failure. Cancels the cooldown. */
  cancel(): void;
  /** Dismiss the "reported" banner. */
  dismiss(): void;
  /** Cleanup timers. Call in ngOnDestroy. */
  destroy(): void;
}

export function createReportCooldown(): ReportCooldown {
  const disabled = signal(false);
  const reported = signal(false);
  let timeout: ReturnType<typeof setTimeout> | null = null;

  function clearCooldown(): void {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  }

  return {
    disabled,
    reported,
    start(): void {
      disabled.set(true);
      clearCooldown();
      timeout = setTimeout(() => {
        disabled.set(false);
        timeout = null;
      }, 60_000);
    },
    markReported(): void {
      reported.set(true);
    },
    cancel(): void {
      disabled.set(false);
      clearCooldown();
    },
    dismiss(): void {
      reported.set(false);
    },
    destroy(): void {
      clearCooldown();
    },
  };
}
