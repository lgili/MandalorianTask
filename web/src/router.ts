import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import Dashboard from './routes/Dashboard.vue';

declare module 'vue-router' {
  interface RouteMeta {
    titulo: string;
    /** Tecla da navegação numérica. Vazia = a rota não aparece na sidebar. */
    tecla: string;
    icone: string;
  }
}

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'dashboard', component: Dashboard,
    meta: { titulo: 'Início', tecla: '1', icone: 'home' } },
  // Projetos vem logo depois do Início: é o agrupador de tudo o mais, e ficar
  // enterrado em Ajustes era o motivo de o app parecer não ter projetos.
  { path: '/projetos', name: 'projetos', component: () => import('./routes/Projetos.vue'),
    meta: { titulo: 'Projetos', tecla: '2', icone: 'folder' } },
  { path: '/projeto/:id', name: 'projeto', component: () => import('./routes/Projeto.vue'),
    meta: { titulo: 'Projeto', tecla: '', icone: 'folder' } },
  { path: '/backlog', name: 'backlog', component: () => import('./routes/Backlog.vue'),
    meta: { titulo: 'Captura', tecla: '3', icone: 'inbox' } },
  { path: '/quadro', name: 'quadro', component: () => import('./routes/Quadro.vue'),
    meta: { titulo: 'Quadro', tecla: '4', icone: 'columns' } },
  { path: '/hoje', name: 'hoje', component: () => import('./routes/Hoje.vue'),
    meta: { titulo: 'Hoje', tecla: '5', icone: 'clock' } },
  { path: '/relatorios', name: 'relatorios', component: () => import('./routes/Relatorios.vue'),
    meta: { titulo: 'Relatórios', tecla: '6', icone: 'chart' } },
  // Ajustes sai da navegação numerada e vive no rodapé da sidebar: é
  // configuração, não um destino de trabalho.
  { path: '/ajustes', name: 'ajustes', component: () => import('./routes/Ajustes.vue'),
    meta: { titulo: 'Ajustes', tecla: '', icone: 'settings' } },
];

export const router = createRouter({ history: createWebHistory(), routes });

router.afterEach((to) => { document.title = `${to.meta.titulo} — Bancada`; });
