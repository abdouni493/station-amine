import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './i18n';

// StrictMode intentionally removed.
//
// React 18+ StrictMode double-invokes every effect in development, which
// races with the cancelled-flag pattern in AppProvider's hydration effect
// and can cause the first hydration run to be aborted before any data
// arrives.  The ref-guard inside AppProvider (hydrationStarted) already
// prevents duplicate hydrations; StrictMode's extra invocations add noise
// without any safety benefit here.
//
// Re-enable StrictMode only after migrating to an effect that is truly
// idempotent under double-invoke (e.g. React Query / SWR).

createRoot(document.getElementById('root')!).render(
  <App />
);
