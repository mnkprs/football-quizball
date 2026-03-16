import { DestroyRef, Injectable, NgZone } from "@angular/core";
import posthog from "posthog-js";
import { environment } from "../../environments/environment";
import { Router } from "@angular/router";

@Injectable({ providedIn: "root" })
export class PosthogService {
  constructor(
    private ngZone: NgZone,
    private router: Router,
    private destroyRef: DestroyRef,
  ) {
    this.initPostHog();
  }

  private initPostHog(): void {
    this.ngZone.runOutsideAngular(() => {
      posthog.init(environment.posthogKey, {
        api_host: environment.posthogHost,
        defaults: '2026-01-30',
      });
    });
  }

  identify(userId: string, props?: Record<string, unknown>): void {
    posthog.identify(userId, props);
  }

  track(event: string, props?: Record<string, unknown>): void {
    posthog.capture(event, props);
  }

  reset(): void {
    posthog.reset();
  }
}
