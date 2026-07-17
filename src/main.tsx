import React from 'react';
import ReactDOM from 'react-dom/client';

import App from '@/App';
import { ThemeProvider } from '@/app/providers/theme-provider';
import '@/shared/styles/globals.css';

/**
 * React StrictMode intentionally runs selected lifecycle logic twice during
 * development. This helps expose unsafe side effects before production.
 */
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
