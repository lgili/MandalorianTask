import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import Hoje from './routes/Hoje.vue';

declare module 'vue-router' {
  interface RouteMeta {
    titulo: string;
    /** Tecla de atalho: 1..5 */
    tecla: string;
    /** Nome do ícone lucide */
    icone: string;
  }
}

const routes: RouteRecordRaw[] = [
  // Hoje é a home e carrega junto — é o que abre em 90% das vezes.
  { path: '/', name: 'hoje', component: Hoje,
    meta: { titulo: 'Hoje', tecla: '1', icone: 'clock' } },
  { path: '/quadro', name: 'quadro', component: () => import('./routes/Quadro.vue'),
    meta: { titulo: 'Quadro', tecla: '2', icone: 'columns' } },
  { path: '/notas', name: 'notas', component: () => import('./routes/Notas.vue'),
    meta: { titulo: 'Notas', tecla: '3', icone: 'file-text' } },
  { path: '/relatorios', name: 'relatorios', component: () => import('./routes/Relatorios.vue'),
    meta: { titulo: 'Relatórios', tecla: '4', icone: 'bar-chart-3' } },
  { path: '/ajustes', name: 'ajustes', component: () => import('./routes/Ajustes.vue'),
    meta: { titulo: 'Ajustes', tecla: '5', icone: 'settings' } },
];

export const router = createRouter({ history: createWebHistory(), routes });

router.afterEach((to) => {
  document.title = `${to.meta.titulo} — Bancada`;
});
