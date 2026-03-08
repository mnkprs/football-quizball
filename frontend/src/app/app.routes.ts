import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/home/home').then(m => m.HomeComponent) },
  { path: 'game', loadComponent: () => import('./features/game/game').then(m => m.GameComponent) },
  { path: 'solo', loadComponent: () => import('./features/solo/solo').then(m => m.SoloComponent), canActivate: [authGuard] },
  { path: 'login', loadComponent: () => import('./features/login/login').then(m => m.LoginComponent) },
  { path: 'leaderboard', loadComponent: () => import('./features/leaderboard/leaderboard').then(m => m.LeaderboardComponent) },
  { path: '**', redirectTo: '' },
];
