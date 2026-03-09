import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs/operators';
import { from } from 'rxjs';
import { AuthService } from '../core/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return from(auth.sessionReady).pipe(
    map(() => (auth.isLoggedIn() ? true : router.createUrlTree(['/login'])))
  );
};
