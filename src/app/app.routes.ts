import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'standings' },
  {
    path: 'standings',
    loadComponent: () => import('./features/standings/standings').then((m) => m.Standings),
    title: 'LPS — Standings',
  },
  {
    path: 'council',
    loadComponent: () => import('./features/council/council').then((m) => m.Council),
    title: 'LPS — Loot Council',
  },
  {
    path: 'history',
    loadComponent: () => import('./features/history/history').then((m) => m.History),
    title: 'LPS — Loot History',
  },
  {
    path: 'rules',
    loadComponent: () => import('./features/rules/rules').then((m) => m.Rules),
    title: 'LPS — Rules',
  },
  { path: '**', redirectTo: 'standings' },
];
