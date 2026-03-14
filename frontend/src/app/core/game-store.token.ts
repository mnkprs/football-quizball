import { InjectionToken } from '@angular/core';

/**
 * Shared injection token so Board/Question/Result components work with either
 * the offline GameStore or the online OnlineGameStore without changes.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GAME_STORE_TOKEN = new InjectionToken<any>('GAME_STORE');
