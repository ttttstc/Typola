import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/app.css'
import App from './app/App'
import { reportFirstPaint } from './perf/firstPaint'

if ('__TAURI_INTERNALS__' in window) {
  document.documentElement.dataset.runtime = 'tauri';
}

if (navigator.platform.toLowerCase().includes('mac')) {
  document.documentElement.dataset.platform = 'macos';
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// First-paint happens during the initial render above; the paint
// entries are observable by the next microtask. Fire-and-forget
// the report — failures (e.g. plain `vite dev`) are swallowed.
void reportFirstPaint();
