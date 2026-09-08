import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import { initTheme } from './lib/theme';
import './style.css';

// Antes do mount: senão a janela pisca branco na abertura.
initTheme();

createApp(App).use(router).mount('#app');
