import { useState, useCallback } from 'react';
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
  const sidebarWidth = useUIStore((s) => s.sidebarWidth);
  const outlineWidth = useUIStore((s) => s.outlineWidth);
  const setSidebarWidth = useUIStore((s) => s.setSidebarWidth);
  const setOutlineWidth = useUIStore((s) => s.setOutlineWidth);

  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isResizingOutline, setIsResizingOutline] = useState(false);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isResizingSidebar) {
        const newWidth = e.clientX;
        setSidebarWidth(newWidth);
      }
      if (isResizingOutline) {
        const newWidth = window.innerWidth - e.clientX;
        setOutlineWidth(newWidth);
      }
    },
    [isResizingSidebar, isResizingOutline, setSidebarWidth, setOutlineWidth]
  );

  const handleMouseUp = useCallback(() => {
    setIsResizingSidebar(false);
    setIsResizingOutline(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  const startResizeSidebar = useCallback(() => {
    setIsResizingSidebar(true);
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const startResizeOutline = useCallback(() => {
    setIsResizingOutline(true);
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <TitleBar />
      <MenuBar />
      <div
        style={{
          display: 'flex',
          flex: 1,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {sidebarVisible && (
          <>
            <div
              style={{
                width: sidebarWidth,
                overflow: 'hidden',
                borderRight: '1px solid var(--color-line-soft)',
                flexShrink: 0,
              }}
            >
              <FileTree />
            </div>
            <div
              onMouseDown={startResizeSidebar}
              style={{
                width: '4px',
                cursor: 'ew-resize',
                background: 'transparent',
                position: 'relative',
                zIndex: 10,
                marginLeft: '-2px',
              }}
            />
          </>
        )}
        <div
          style={{
            flex: 1,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
          }}
        >
          <TabBar />
          <Editor />
        </div>
        {outlineVisible && (
          <>
            <div
              onMouseDown={startResizeOutline}
              style={{
                width: '4px',
                cursor: 'ew-resize',
                background: 'transparent',
                position: 'relative',
                zIndex: 10,
                marginRight: '-2px',
              }}
            />
            <div
              style={{
                width: outlineWidth,
                overflow: 'hidden',
                borderLeft: '1px solid var(--color-line-soft)',
                flexShrink: 0,
              }}
            >
              <Outline />
            </div>
          </>
        )}
      </div>
      <StatusBar />
    </div>
  );
}
