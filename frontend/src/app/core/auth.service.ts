import { Injectable, signal, computed } from '@angular/core';
import { createClient, SupabaseClient, Session, User } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
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
        // Use PKCE for browser OAuth — avoids implicit-flow nonce mismatches
        // ("Passed nonce and nonce in id_token should either both exist or not")
        // when redirecting back from Google / Apple.
        flowType: 'pkce',
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
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

  async signUpWithEmail(email: string, password: string): Promise<void> {
    const { error } = await this.supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
    if (error) throw error;
  }

  async signInWithEmail(email: string, password: string): Promise<void> {
    const { error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async fetchUsernameSet(userId: string): Promise<boolean> {
    const { data } = await this.supabase
      .from('profiles')
      .select('username_set')
      .eq('id', userId)
      .single();
    return (data as { username_set?: boolean } | null)?.username_set ?? false;
  }

  /**
   * Returns both `username_set` and the current `username` so callers can
   * decide whether to (re)open the username modal — e.g. when the stored
   * username is still an Apple Hide-My-Email relay id from a legacy signup.
   */
  async fetchProfileMeta(userId: string): Promise<{ usernameSet: boolean; username: string | null }> {
    const { data } = await this.supabase
      .from('profiles')
      .select('username_set, username')
      .eq('id', userId)
      .single();
    const row = data as { username_set?: boolean; username?: string | null } | null;
    return {
      usernameSet: row?.username_set ?? false,
      username: row?.username ?? null,
    };
  }

  async signInWithGoogle(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      const { GoogleAuth } = await import('@southdevs/capacitor-google-auth');
      await GoogleAuth.initialize();
      const googleUser = await GoogleAuth.signIn({
        scopes: ['profile', 'email'],
        serverClientId: '215249721443-drub176d1u1jha7pl9uvvuo596uspbo5.apps.googleusercontent.com',
      });
      // Note: requires "Skip nonce checks" enabled on the Google provider in
      // Supabase — the native @southdevs/capacitor-google-auth SDK doesn't
      // expose the nonce used when issuing the id_token.
      const { error } = await this.supabase.auth.signInWithIdToken({
        provider: 'google',
        token: googleUser.authentication.idToken,
      });
      if (error) throw error;
    } else {
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
  }

  async signInWithApple(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      const { SignInWithApple } = await import('@capacitor-community/apple-sign-in');
      const result = await SignInWithApple.authorize({
        clientId: environment.appleClientId,
        redirectURI: `https://${environment.supabaseUrl.replace('https://', '')}/auth/v1/callback`,
        scopes: 'email name',
      });
      const { error } = await this.supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: result.response.identityToken!,
      });
      if (error) throw error;
    } else {
      const redirectUrl = `${window.location.origin}/`;
      const { error } = await this.supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: { redirectTo: redirectUrl },
      });
      if (error) throw error;
    }
  }

  async fetchAvatarUrl(userId: string): Promise<string | null> {
    const { data } = await this.supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', userId)
      .single();
    return (data as { avatar_url?: string } | null)?.avatar_url ?? null;
  }

  async uploadAvatar(userId: string, file: File): Promise<string> {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${userId}/avatar.${ext}`;
    const { error } = await this.supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) throw error;
    const { data } = this.supabase.storage.from('avatars').getPublicUrl(path);
    const url = `${data.publicUrl}?t=${Date.now()}`;
    await this.supabase.from('profiles').update({ avatar_url: url }).eq('id', userId);
    return url;
  }

  /** Expose the Supabase client for Realtime subscriptions (e.g. online game updates). */
  get supabaseClient(): SupabaseClient {
    return this.supabase;
  }

  async signOut(): Promise<void> {
    await this.supabase.auth.signOut();
  }

  async updateEmail(email: string): Promise<void> {
    const { error } = await this.supabase.auth.updateUser({ email });
    if (error) throw error;
  }

  async resetPasswordForEmail(email: string): Promise<void> {
    const { error } = await this.supabase.auth.resetPasswordForEmail(email);
    if (error) throw error;
  }

  /**
   * Patch the locally-cached Supabase user metadata (e.g. after the user picks
   * a username for the first time) so any signal computed from `auth.user()`
   * — like the top-nav `displayName` — updates immediately, without waiting
   * for a page reload or the next auth event.
   */
  async refreshUserMetadata(patch: Record<string, unknown>): Promise<void> {
    const { data, error } = await this.supabase.auth.updateUser({ data: patch });
    if (error) throw error;
    if (data.user) this._user.set(data.user);
  }

  /**
   * Apple Sign in with Hide-My-Email returns an address of the form
   *   {hex}@privaterelay.appleid.com
   * which is fine for delivery but ugly to display in the UI. This helper
   * lets the UI substitute a friendlier label.
   */
  static isPrivateRelayEmail(email: string | null | undefined): boolean {
    return !!email && /@privaterelay\.appleid\.com$/i.test(email);
  }
}
