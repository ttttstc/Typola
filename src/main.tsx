import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/app.css'
import App from './app/App'

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
