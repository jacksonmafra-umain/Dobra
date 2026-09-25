import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loadConfig } from './config/load';
import { ConfigError } from './config/schema';
import './styles/index.css';
import { App } from './ui/App';
import { ConfigErrorPage } from './ui/ConfigErrorPage';

function Root() {
  try {
    return <App config={loadConfig()} />;
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      return <ConfigErrorPage error={error} />;
    }
    throw error;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
