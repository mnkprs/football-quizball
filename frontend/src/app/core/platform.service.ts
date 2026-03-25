import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';

@Injectable({ providedIn: 'root' })
export class PlatformService {
  readonly isNative = Capacitor.isNativePlatform();
  readonly isIos = Capacitor.getPlatform() === 'ios';
  readonly isAndroid = Capacitor.getPlatform() === 'android';
  readonly isWeb = Capacitor.getPlatform() === 'web';
}
