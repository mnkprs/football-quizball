import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError, retry, timer } from 'rxjs';
import { ToastService } from './toast.service';
import { AuthModalService } from './auth-modal.service';
import { ProService } from './pro.service';
import { CrashlyticsService } from './crashlytics.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);
  const authModal = inject(AuthModalService);
  const pro = inject(ProService);
  const crashlytics = inject(CrashlyticsService);

  return next(req).pipe(
    retry({
      count: 2,
      delay: (error: HttpErrorResponse, retryCount: number) => {
        // Only retry idempotent methods on network errors or server errors
        const safe = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
        if (safe && (error.status === 0 || error.status >= 500)) {
          return timer(Math.pow(2, retryCount) * 1000);
        }
        return throwError(() => error);
      },
    }),
    catchError((err: HttpErrorResponse) => {
      const serverMsg =
        (typeof err.error === 'string' ? err.error : null) ??
        err.error?.message ??
        err.error?.error ??
        err.message;

      if (err.status === 401) {
        authModal.open();
      } else if (err.status === 402) {
        pro.showUpgradeModal.set(true);
      } else if (err.status === 0) {
        toast.show('Connection lost. Check your network.', 'error');
      } else if (err.status >= 500) {
        toast.show(serverMsg ? `Server error: ${serverMsg}` : 'Something went wrong. Please try again.', 'error');
      }

      // Report network failures and 5xx to Crashlytics so they show up as non-fatals.
      // Skip 4xx (other than 0/5xx) — those are usually expected app-level errors.
      if (err.status === 0 || err.status >= 500) {
        void crashlytics.recordException(new Error(`HTTP ${err.status} ${req.method} ${stripQuery(req.url)}: ${serverMsg ?? 'no message'}`), {
          http_status: err.status,
          http_method: req.method,
          http_url: stripQuery(req.url),
        });
      }

      return throwError(() => err);
    }),
  );
};

function stripQuery(url: string): string {
  const i = url.indexOf('?');
  return i === -1 ? url : url.slice(0, i);
}
