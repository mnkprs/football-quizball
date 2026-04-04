export interface Profile {
  id: string;
  username: string;
  elo: number;
  logo_quiz_elo: number;
  logo_quiz_hardcore_elo: number;
  logo_quiz_games_played: number;
  logo_quiz_hardcore_games_played: number;
  games_played: number;
  questions_answered: number;
  correct_answers: number;
  country_code: string | null;
}

export interface ProStatus {
  is_pro: boolean;
  trial_battle_royale_used: number;
  purchase_type: string | null;
  pro_lifetime_owned: boolean;
  subscription_expires_at: string | null;
  daily_duels_played: number;
  daily_duels_reset_at: string | null;
  stripe_customer_id: string | null;
}

export interface SetProParams {
  isPro: boolean;
  proSource?: 'subscription' | 'lifetime' | 'admin_grant';
  proLifetimeOwned?: boolean;
  proExpiresAt?: string | null;
  iapPlatform?: 'ios' | 'android';
  iapOriginalTransactionId?: string;
}
