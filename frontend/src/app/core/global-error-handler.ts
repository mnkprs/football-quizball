import { ErrorHandler, Injectable, inject } from '@angular/core';
import { CrashlyticsService } from './crashlytics.service';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly crashlytics = inject(CrashlyticsService);

  handleError(error: unknown): void {
    // Unwrap Angular / Promise rejection wrappers to get the real error
    const unwrapped = this.unwrap(error);

    console.error('[GlobalErrorHandler]', unwrapped);

    void this.crashlytics.recordException(unwrapped);
  }

  private unwrap(error: unknown): unknown {
    if (error && typeof error === 'object') {
      // Angular wraps promise rejections
      if ('rejection' in error) return (error as { rejection: unknown }).rejection;
      // Older Angular wraps errors
      if ('ngOriginalError' in error) return (error as { ngOriginalError: unknown }).ngOriginalError;
    }
    return error;
  }
}
