import { TitleBar } from './TitleBar';
import { MenuBar } from './MenuBar';
import { FileTree } from './FileTree';
import { Editor } from './Editor';
import { Outline } from './Outline';
import { StatusBar } from './StatusBar';
import { TabBar } from './TabBar';
import { useUIStore } from '../store/ui';

export function Layout() {
  const sidebarVisible = useUIStore((s) => s.sidebarVisible);
  const outlineVisible = useUIStore((s) => s.outlineVisible);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
      }}
    >
      <TitleBar />
      <MenuBar />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `${sidebarVisible ? 'var(--sidebar-width)' : '0px'} 1fr ${outlineVisible ? 'var(--outline-width)' : '0px'}`,
          flex: 1,
          overflow: 'hidden',
          transition: 'grid-template-columns 200ms ease',
        }}
      >
        <div
          style={{
            overflow: 'hidden',
            borderRight: sidebarVisible ? '1px solid var(--color-line-soft)' : 'none',
          }}
        >
          {sidebarVisible && <FileTree />}
        </div>
        <div
          style={{
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
          }}
        >
          <TabBar />
          <Editor />
        </div>
        <div
          style={{
            overflow: 'hidden',
            borderLeft: outlineVisible ? '1px solid var(--color-line-soft)' : 'none',
          }}
        >
          {outlineVisible && <Outline />}
        </div>
      </div>
      <StatusBar />
    </div>
  );
}
