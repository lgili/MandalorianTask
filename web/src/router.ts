import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import Dashboard from './routes/Dashboard.vue';

declare module 'vue-router' {
  interface RouteMeta {
    title: string;
    /** Key for number navigation. Empty = the route does not show up in the sidebar. */
    shortcut: string;
    icon: string;
  }
}

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'dashboard', component: Dashboard,
    meta: { title: 'Home', shortcut: '1', icon: 'home' } },
  // Projects comes right after Home: it groups everything else, and being
  // buried in Settings was why the app seemed to have no projects.
  { path: '/projects', name: 'projects', component: () => import('./routes/Projects.vue'),
    meta: { title: 'Projects', shortcut: '2', icon: 'folder' } },
  { path: '/project/:id', name: 'project', component: () => import('./routes/Project.vue'),
    meta: { title: 'Project', shortcut: '', icon: 'folder' } },
  // Notes right after Projects: they are the two halves of the app — what you do
  // and what you know. The open note goes in the query (?note=folder/note.md): a path
  // with slashes and accents as a route param is a fight with the router's encoder.
  { path: '/notes', name: 'notes', component: () => import('./routes/Notes.vue'),
    meta: { title: 'Notes', shortcut: '3', icon: 'notebook' } },
  { path: '/capture', name: 'capture', component: () => import('./routes/Capture.vue'),
    meta: { title: 'Capture', shortcut: '4', icon: 'inbox' } },
  { path: '/board', name: 'board', component: () => import('./routes/Board.vue'),
    meta: { title: 'Board', shortcut: '5', icon: 'columns' } },
  { path: '/today', name: 'today', component: () => import('./routes/Today.vue'),
    meta: { title: 'Today', shortcut: '6', icon: 'clock' } },
  { path: '/reports', name: 'reports', component: () => import('./routes/Reports.vue'),
    meta: { title: 'Reports', shortcut: '7', icon: 'chart' } },
  // Panel registered by a plugin (e.g. the Graph). The plugin mounts the content.
  { path: '/plugin/:plugin/:panel', name: 'plugin', component: () => import('./routes/Plugin.vue'),
    meta: { title: 'Plugin', shortcut: '', icon: 'puzzle' } },
  // Settings leaves the numbered navigation and lives in the sidebar footer: it is
  // configuration, not a place you go to work.
  { path: '/settings', name: 'settings', component: () => import('./routes/Settings.vue'),
    meta: { title: 'Settings', shortcut: '', icon: 'settings' } },
];

export const router = createRouter({ history: createWebHistory(), routes });

router.afterEach((to) => { document.title = `${to.meta.title} — Bancada`; });
