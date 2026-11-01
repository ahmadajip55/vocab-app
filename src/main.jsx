import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App.jsx';
import { registerServiceWorker } from './lib/pwa.js';
import { followSystemTheme } from './lib/theme.js';
import './styles/theme.scss';
import './styles/app.css';

followSystemTheme();
registerServiceWorker();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
