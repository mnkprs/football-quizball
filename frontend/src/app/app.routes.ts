import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { proGuard } from './guards/pro.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./layout/shell/shell').then(m => m.ShellComponent),
    children: [
      { path: '', loadComponent: () => import('./features/home/home').then(m => m.HomeComponent) },
      { path: 'invite', loadComponent: () => import('./features/invite/invite').then(m => m.InviteComponent) },
      { path: 'news', loadComponent: () => import('./features/news-mode/news-mode').then(m => m.NewsModeComponent) },
      { path: 'mayhem', loadComponent: () => import('./features/mayhem-mode/mayhem-mode').then(m => m.MayhemModeComponent), canActivate: [authGuard] },
      { path: 'solo', loadComponent: () => import('./features/solo/solo').then(m => m.SoloComponent), canActivate: [proGuard] },
      { path: 'blitz', loadComponent: () => import('./features/blitz/blitz').then(m => m.BlitzComponent), canActivate: [proGuard] },
      { path: 'daily', loadComponent: () => import('./features/daily/daily').then(m => m.DailyComponent) },
      { path: 'leaderboard', loadComponent: () => import('./features/leaderboard/leaderboard').then(m => m.LeaderboardComponent) },
      { path: 'profile', loadComponent: () => import('./features/profile/profile').then(m => m.ProfileComponent) },
      { path: 'profile/:userId', loadComponent: () => import('./features/profile/profile').then(m => m.ProfileComponent), canActivate: [authGuard] },
    ],
  },
  { path: 'game', loadComponent: () => import('./features/game/game').then(m => m.GameComponent) },
  { path: 'online-game', canActivate: [authGuard], loadComponent: () => import('./features/online-game/online-lobby').then(m => m.OnlineLobbyComponent) },
  { path: 'online-game/:id', canActivate: [authGuard], loadComponent: () => import('./features/online-game/online-play').then(m => m.OnlinePlayComponent) },
  { path: 'join/:code', loadComponent: () => import('./features/online-game/join-invite').then(m => m.JoinInviteComponent) },
  { path: 'login', loadComponent: () => import('./features/login/login').then(m => m.LoginComponent) },
  { path: 'admin', loadComponent: () => import('./features/admin/admin').then(m => m.AdminComponent) },
  { path: 'onboarding', loadComponent: () => import('./features/onboarding/onboarding').then(m => m.OnboardingComponent) },
  { path: '**', redirectTo: '' },
];
