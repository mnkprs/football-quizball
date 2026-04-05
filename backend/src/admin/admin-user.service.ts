import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { ErrorLogService } from './error-log.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PaginatedUsers {
  data: any[];
  total: number;
  page: number;
  limit: number;
}

export interface UserDetail {
  profile: Record<string, any>;
  proStatus: any;
  eloHistory: any[];
  recentGames: any[];
}

export interface GrantProResult {
  changed: boolean;
  alreadyPro?: boolean;
}

export interface RevokeProResult {
  changed: boolean;
  warning?: string;
}

export interface ResetEloResult {
  changed?: boolean;
  blocked?: boolean;
  reason?: string;
  eloBefore?: number;
  eloAfter?: number;
}

@Injectable()
export class AdminUserService {
  private readonly logger = new Logger(AdminUserService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly errorLogService: ErrorLogService,
  ) {}

  isValidUuid(id: string): boolean {
    return UUID_RE.test(id);
  }

  async getUsers(searchTerm: string, page: number, limit: number): Promise<PaginatedUsers> {
    const p = Math.max(1, page);
    const l = Math.min(100, Math.max(1, limit));
    const offset = (p - 1) * l;

    let query = this.supabaseService.client
      .from('profiles')
      .select('id, username, elo, games_played, questions_answered, correct_answers, is_pro, purchase_type, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + l - 1);

    if (searchTerm.length >= 2) {
      if (/^[0-9a-f]{8}-/i.test(searchTerm)) {
        query = query.eq('id', searchTerm);
      } else {
        const escaped = searchTerm.replace(/%/g, '\\%').replace(/_/g, '\\_');
        query = query.ilike('username', `%${escaped}%`);
      }
    }

    const { data, count, error } = await query;

    if (error) {
      this.logger.error(`[getUsers] Query failed: ${error.message}`);
      return { data: [], total: 0, page: p, limit: l };
    }

    return { data: data ?? [], total: count ?? 0, page: p, limit: l };
  }

  async getUserById(id: string): Promise<UserDetail | null> {
    const [profile, eloHistory, proStatus] = await Promise.all([
      this.supabaseService.getProfile(id),
      this.supabaseService.getEloHistory(id, 20),
      this.supabaseService.getProStatus(id),
    ]);

    if (!profile) {
      return null;
    }

    const { data: recentMatches } = await this.supabaseService.client
      .from('match_history')
      .select('id, player1_id, player2_id, player1_username, player2_username, winner_id, player1_score, player2_score, match_mode, played_at')
      .or(`player1_id.eq.${id},player2_id.eq.${id}`)
      .order('played_at', { ascending: false })
      .limit(10);

    return {
      profile: { ...profile, is_pro: proStatus?.is_pro ?? false },
      proStatus,
      eloHistory,
      recentGames: recentMatches ?? [],
    };
  }

  async grantPro(id: string): Promise<GrantProResult> {
    const proStatus = await this.supabaseService.getProStatus(id);
    if (proStatus?.is_pro) {
      return { changed: false, alreadyPro: true };
    }

    await this.supabaseService.setProStatus(id, { isPro: true, proSource: 'admin_grant' });
    await this.errorLogService.writeAuditLog('grant-pro', id, {});
    this.logger.warn(`[Admin] Granted Pro to user ${id}`);

    return { changed: true };
  }

  async revokePro(id: string): Promise<RevokeProResult> {
    const proStatus = await this.supabaseService.getProStatus(id);

    let warning: string | undefined;
    if (proStatus?.purchase_type === 'subscription' || proStatus?.purchase_type === 'lifetime') {
      warning = `User has a paid ${proStatus.purchase_type} — revoking admin override only; subscription may re-activate on next webhook.`;
    }

    await this.supabaseService.setProStatus(id, { isPro: false });
    await this.errorLogService.writeAuditLog('revoke-pro', id, { hadWarning: !!warning });
    this.logger.warn(`[Admin] Revoked Pro for user ${id}${warning ? ' (paid source warning)' : ''}`);

    return { changed: true, ...(warning ? { warning } : {}) };
  }

  async resetElo(id: string, currentElo: number): Promise<ResetEloResult> {
    // Check for active games
    const [{ count: activeDuels }, { count: activeOnline }, { count: activeBR }] = await Promise.all([
      this.supabaseService.client
        .from('duel_games')
        .select('id', { count: 'exact', head: true })
        .or(`host_id.eq.${id},guest_id.eq.${id}`)
        .eq('status', 'active'),
      this.supabaseService.client
        .from('online_games')
        .select('id', { count: 'exact', head: true })
        .or(`host_id.eq.${id},guest_id.eq.${id}`)
        .eq('status', 'active'),
      this.supabaseService.client
        .from('battle_royale_players')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', id)
        .is('finished_at', null),
    ]);

    if ((activeDuels ?? 0) > 0 || (activeOnline ?? 0) > 0 || (activeBR ?? 0) > 0) {
      return { blocked: true, reason: 'User has active games' };
    }

    const eloBefore = currentElo;
    const eloAfter = 1000;

    await this.supabaseService.updateElo(id, eloAfter);
    await this.supabaseService.insertEloHistory({
      user_id: id,
      elo_before: eloBefore,
      elo_after: eloAfter,
      elo_change: eloAfter - eloBefore,
      question_difficulty: 'ADMIN_RESET',
      correct: false,
      timed_out: false,
    });

    await this.errorLogService.writeAuditLog('reset-elo', id, { eloBefore });
    this.logger.warn(`[Admin] Reset ELO for user ${id}: ${eloBefore} → ${eloAfter}`);

    return { changed: true, eloBefore, eloAfter };
  }
}
