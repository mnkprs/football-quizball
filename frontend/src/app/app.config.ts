import { ApplicationConfig, EnvironmentProviders, provideBrowserGlobalErrorListeners, provideZoneChangeDetection, provideAppInitializer, isDevMode, inject } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { Capacitor } from '@capacitor/core';
import { routes } from './app.routes';
import { GoogleAdsService } from './core/google-ads.service';
import { provideServiceWorker } from '@angular/service-worker';
import { errorInterceptor } from './core/error.interceptor';

const swProviders: EnvironmentProviders[] = Capacitor.isNativePlatform()
  ? []
  : [provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    })];

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([errorInterceptor])),
    provideAnimations(),
    provideAppInitializer(() => inject(GoogleAdsService).init()),
    ...swProviders,
  ]
};
