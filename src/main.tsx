import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installSpanishValidation } from './lib/formValidation';
import './styles.css';
import './design-system/tokens.css';
import './design-system/components.css';
import './design-system/app-theme.css';

const removeValidation = installSpanishValidation();
import.meta.hot?.dispose(removeValidation);

// Retire the original app's offline worker so it cannot keep serving an old release.
if ('serviceWorker' in navigator) {
  void navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => {
      for (const registration of registrations) void registration.unregister();
    })
    .catch(() => undefined);
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
