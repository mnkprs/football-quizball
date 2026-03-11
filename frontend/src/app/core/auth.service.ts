import { Injectable, signal, computed } from '@angular/core';
import { createClient, SupabaseClient, Session, User } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private supabase: SupabaseClient;
  private _session = signal<Session | null>(null);
  private _user = signal<User | null>(null);

  readonly session = this._session.asReadonly();
  readonly user = this._user.asReadonly();
  readonly isLoggedIn = computed(() => !!this._user());
  readonly accessToken = computed(() => this._session()?.access_token ?? null);

  /** Resolves when the initial session has been restored from storage (e.g. after refresh). */
  readonly sessionReady: Promise<void>;

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
      auth: {
        // Use no-op lock to avoid NavigatorLockAcquireTimeoutError (multi-tab / strict mode contention)
        lock: async (_name, _acquireTimeout, fn) => fn(),
      },
    });
    // Restore session from localStorage — guard must await sessionReady before checking
    this.sessionReady = this.supabase.auth.getSession().then(({ data }) => {
      this._session.set(data.session);
      this._user.set(data.session?.user ?? null);
    }).then(() => undefined);
    // Listen for auth changes
    this.supabase.auth.onAuthStateChange((_event, session) => {
      this._session.set(session);
      this._user.set(session?.user ?? null);
    });
  }

  async signInWithGoogle(): Promise<void> {
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await this.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        queryParams: { access_type: 'offline', prompt: 'select_account' },
      },
    });
    if (error) throw error;
  }

  async signOut(): Promise<void> {
    await this.supabase.auth.signOut();
  }
}
