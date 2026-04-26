import { useEffect } from 'react';
import { Layout } from './components/Layout';
import { useUIStore } from './store/ui';
import { useAIStore } from './store/ai';
import './i18n';
import './styles/tokens.css';
import './styles/themes.css';
import './styles/light.css';
import './styles/dark.css';
import './styles/editor.css';

function App() {
  const theme = useUIStore((s) => s.theme);
  const initializeAI = useAIStore((s) => s.initialize);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    void initializeAI();
  }, [initializeAI]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '\\' && !e.shiftKey && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        useUIStore.getState().toggleSidebar();
      }
      if (e.key.toLowerCase() === 'f' && e.shiftKey && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        useUIStore.getState().setSidebarVisible(true);
        useUIStore.getState().setSidebarTab('search');
      }
      if (e.key === '\\' && e.shiftKey && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        useUIStore.getState().toggleOutline();
      }
      if (e.key === 'd' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault();
        useUIStore.getState().toggleTheme();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return <Layout />;
}

export default App;
