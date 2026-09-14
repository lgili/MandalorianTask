import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import { initTheme } from './lib/theme';
import './style.css';

// Before mount: otherwise the window flashes white when it opens.
initTheme();

createApp(App).use(router).mount('#app');
