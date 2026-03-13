import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { ProService } from '../core/pro.service';

export const proGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const proService = inject(ProService);
  const router = inject(Router);

  await auth.sessionReady;

  if (!auth.isLoggedIn()) {
    return router.createUrlTree(['/login']);
  }

  await proService.ensureLoaded();

  if (proService.isPro() || proService.trialRemaining() > 0) {
    return true;
  }

  proService.showUpgradeModal.set(true);
  return false;
};
