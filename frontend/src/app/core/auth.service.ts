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

  async signInWithGoogle(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      const { GoogleAuth } = await import('@southdevs/capacitor-google-auth');
      await GoogleAuth.initialize();
      const googleUser = await GoogleAuth.signIn({ scopes: ['profile', 'email'] });
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
}
