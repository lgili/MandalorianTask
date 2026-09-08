import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import Backlog from './routes/Backlog.vue';

declare module 'vue-router' {
  interface RouteMeta {
    titulo: string;
    tecla: string;
    icone: string;
  }
}

const routes: RouteRecordRaw[] = [
  // Backlog é a home: é a tela usada durante reunião, e é a de captura.
  { path: '/', name: 'backlog', component: Backlog,
    meta: { titulo: 'Backlog', tecla: '1', icone: 'inbox' } },
  { path: '/quadro', name: 'quadro', component: () => import('./routes/Quadro.vue'),
    meta: { titulo: 'Quadro', tecla: '2', icone: 'columns' } },
  { path: '/hoje', name: 'hoje', component: () => import('./routes/Hoje.vue'),
    meta: { titulo: 'Hoje', tecla: '3', icone: 'clock' } },
  { path: '/relatorios', name: 'relatorios', component: () => import('./routes/Relatorios.vue'),
    meta: { titulo: 'Relatórios', tecla: '4', icone: 'chart' } },
  { path: '/ajustes', name: 'ajustes', component: () => import('./routes/Ajustes.vue'),
    meta: { titulo: 'Ajustes', tecla: '5', icone: 'settings' } },
];

export const router = createRouter({ history: createWebHistory(), routes });

router.afterEach((to) => { document.title = `${to.meta.titulo} — Bancada`; });
