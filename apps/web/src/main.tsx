import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app/App';
import { MonitoringErrorBoundary } from './app/MonitoringErrorBoundary';
import { AuthProvider } from './features/auth/AuthProvider';
import { installGlobalErrorMonitoring } from './lib/monitoring';
import './styles/global.css';

installGlobalErrorMonitoring();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MonitoringErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </MonitoringErrorBoundary>
  </React.StrictMode>,
);
