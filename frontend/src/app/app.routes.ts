import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { environment } from '../environments/environment';

const fullRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./layout/shell/shell').then(m => m.ShellComponent),
    children: [
      { path: '', loadComponent: () => import('./features/home/home').then(m => m.HomeComponent) },
      { path: 'today', loadComponent: () => import('./features/today/today').then(m => m.TodayComponent) },
      { path: 'invite', loadComponent: () => import('./features/invite/invite').then(m => m.InviteComponent) },
      { path: 'news', loadComponent: () => import('./features/news-mode/news-mode').then(m => m.NewsModeComponent) },
      { path: 'mayhem', loadComponent: () => import('./features/mayhem-mode/mayhem-mode').then(m => m.MayhemModeComponent) },
      { path: 'solo', loadComponent: () => import('./features/solo/solo').then(m => m.SoloComponent) },
      { path: 'blitz', loadComponent: () => import('./features/blitz/blitz').then(m => m.BlitzComponent) },
      { path: 'logo-quiz', loadComponent: () => import('./features/logo-quiz/logo-quiz').then(m => m.LogoQuizComponent), canActivate: [authGuard] },
      { path: 'daily', loadComponent: () => import('./features/daily/daily').then(m => m.DailyComponent) },
      { path: 'leaderboard', loadComponent: () => import('./features/leaderboard/leaderboard').then(m => m.LeaderboardComponent) },
      { path: 'notifications', loadComponent: () => import('./features/notifications/notifications').then(m => m.NotificationsComponent), canActivate: [authGuard] },
      { path: 'profile', loadComponent: () => import('./features/profile/profile').then(m => m.ProfileComponent) },
      { path: 'profile/:userId', loadComponent: () => import('./features/profile/profile').then(m => m.ProfileComponent), canActivate: [authGuard] },
      { path: 'duel', loadComponent: () => import('./features/duel/duel-lobby').then(m => m.DuelLobbyComponent), canActivate: [authGuard] },
      { path: 'battle-royale', canActivate: [authGuard], loadComponent: () => import('./features/battle-royale/battle-royale-lobby').then(m => m.BattleRoyaleLobbyComponent) },
      { path: 'analytics', canActivate: [authGuard], loadComponent: () => import('./features/analytics/analytics').then(m => m.AnalyticsComponent) },
    ],
  },
  { path: 'game', loadComponent: () => import('./features/game/game').then(m => m.GameComponent) },
  { path: 'online-game', canActivate: [authGuard], loadComponent: () => import('./features/online-game/online-lobby').then(m => m.OnlineLobbyComponent) },
  { path: 'online-game/:id', canActivate: [authGuard], loadComponent: () => import('./features/online-game/online-play').then(m => m.OnlinePlayComponent) },
  { path: 'join/:code', loadComponent: () => import('./features/online-game/join-invite').then(m => m.JoinInviteComponent) },
  { path: 'duel/:id', canActivate: [authGuard], loadComponent: () => import('./features/duel/duel-play').then(m => m.DuelPlayComponent) },
  { path: 'battle-royale/:id', canActivate: [authGuard], loadComponent: () => import('./features/battle-royale/battle-royale-play').then(m => m.BattleRoyalePlayComponent) },
  { path: 'match/:id', canActivate: [authGuard], loadComponent: () => import('./features/match-detail/match-detail').then(m => m.MatchDetailComponent) },
  { path: 'login', loadComponent: () => import('./features/login/login').then(m => m.LoginComponent) },
  { path: 'admin', loadComponent: () => import('./features/admin/admin-dashboard').then(m => m.AdminDashboardComponent) },
  { path: 'admin-legacy', loadComponent: () => import('./features/admin/admin-legacy').then(m => m.AdminLegacyComponent) },
  { path: 'onboarding', loadComponent: () => import('./features/onboarding/onboarding').then(m => m.OnboardingComponent) },
  { path: 'terms', loadComponent: () => import('./features/legal/terms').then(m => m.TermsComponent) },
  { path: 'privacy', loadComponent: () => import('./features/legal/privacy').then(m => m.PrivacyComponent) },
  { path: '**', loadComponent: () => import('./features/not-found/not-found').then(m => m.NotFoundComponent) },
];

const landingRoutes: Routes = [
  { path: '', loadComponent: () => import('./features/landing/landing').then(m => m.LandingComponent) },
  { path: 'terms', loadComponent: () => import('./features/legal/terms').then(m => m.TermsComponent) },
  { path: 'privacy', loadComponent: () => import('./features/legal/privacy').then(m => m.PrivacyComponent) },
  { path: '**', redirectTo: '' },
];

export const routes: Routes = environment.landingMode ? landingRoutes : fullRoutes;
