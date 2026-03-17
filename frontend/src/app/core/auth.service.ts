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
}
