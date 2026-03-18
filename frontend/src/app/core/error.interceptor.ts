import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ToastService } from './toast.service';
import { AuthModalService } from './auth-modal.service';
import { ProService } from './pro.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);
  const authModal = inject(AuthModalService);
  const pro = inject(ProService);

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401) {
        authModal.open();
      } else if (err.status === 402) {
        pro.showUpgradeModal.set(true);
      } else if (err.status === 0) {
        toast.show('Connection lost. Check your network.', 'error');
      } else if (err.status >= 500) {
        toast.show('Something went wrong. Please try again.', 'error');
      }
      return throwError(() => err);
    }),
  );
};
