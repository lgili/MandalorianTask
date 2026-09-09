import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import Dashboard from './routes/Dashboard.vue';

declare module 'vue-router' {
  interface RouteMeta {
    titulo: string;
    tecla: string;
    icone: string;
  }
}

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'dashboard', component: Dashboard,
    meta: { titulo: 'Início', tecla: '1', icone: 'home' } },
  { path: '/backlog', name: 'backlog', component: () => import('./routes/Backlog.vue'),
    meta: { titulo: 'Backlog', tecla: '2', icone: 'inbox' } },
  { path: '/quadro', name: 'quadro', component: () => import('./routes/Quadro.vue'),
    meta: { titulo: 'Quadro', tecla: '3', icone: 'columns' } },
  { path: '/hoje', name: 'hoje', component: () => import('./routes/Hoje.vue'),
    meta: { titulo: 'Hoje', tecla: '4', icone: 'clock' } },
  { path: '/relatorios', name: 'relatorios', component: () => import('./routes/Relatorios.vue'),
    meta: { titulo: 'Relatórios', tecla: '5', icone: 'chart' } },
  { path: '/ajustes', name: 'ajustes', component: () => import('./routes/Ajustes.vue'),
    meta: { titulo: 'Ajustes', tecla: '6', icone: 'settings' } },
];

export const router = createRouter({ history: createWebHistory(), routes });

router.afterEach((to) => { document.title = `${to.meta.titulo} — Bancada`; });
