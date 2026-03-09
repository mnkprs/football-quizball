import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./layout/shell/shell').then(m => m.ShellComponent),
    children: [
      { path: '', loadComponent: () => import('./features/home/home').then(m => m.HomeComponent) },
      { path: 'invite', loadComponent: () => import('./features/invite/invite').then(m => m.InviteComponent) },
      { path: 'solo', loadComponent: () => import('./features/solo/solo').then(m => m.SoloComponent), canActivate: [authGuard] },
      { path: 'blitz', loadComponent: () => import('./features/blitz/blitz').then(m => m.BlitzComponent), canActivate: [authGuard] },
      { path: 'daily', loadComponent: () => import('./features/daily/daily').then(m => m.DailyComponent) },
      { path: 'leaderboard', loadComponent: () => import('./features/leaderboard/leaderboard').then(m => m.LeaderboardComponent) },
      { path: 'profile', loadComponent: () => import('./features/profile/profile').then(m => m.ProfileComponent) },
      { path: 'profile/:userId', loadComponent: () => import('./features/profile/profile').then(m => m.ProfileComponent), canActivate: [authGuard] },
    ],
  },
  { path: 'game', loadComponent: () => import('./features/game/game').then(m => m.GameComponent) },
  { path: 'login', loadComponent: () => import('./features/login/login').then(m => m.LoginComponent) },
  { path: '**', redirectTo: '' },
];
