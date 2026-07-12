import { PaperTexture } from '@paper-design/shaders-react';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useSettings } from '../../../hooks/useSettings';
import type { ThemeId } from '../../../services/themeRegistry';

const SHADER_UNSUPPORTED_THEMES = new Set<ThemeId>(['night-current', 'abstract']);

const PAPER_TEXTURE_PARAMS = {
  speed: 0,
  contrast: 0.8,
  roughness: 0.4,
  fiber: 0.3,
  fiberSize: 0.2,
  crumples: 0.3,
  crumpleSize: 0.35,
  folds: 0.65,
  foldCount: 5,
  fade: 0,
  drops: 0.2,
  seed: 5.8,
} as const;

function paperTextureBaseImage(color: string): string {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="${color}"/></svg>`)}`;
}

function resolveThemeColor(variable: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const probe = document.createElement('span');
  probe.style.color = `var(${variable})`;
  document.body?.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return /^(rgb|hsl)/i.test(color) || /^#[\da-f]{3,8}$/i.test(color) ? color : fallback;
}

type EditorPanePaperBackgroundProps = {
  children: ReactNode;
};

export function EditorPanePaperBackground({ children }: EditorPanePaperBackgroundProps) {
  const settings = useSettings();
  const shaderEnabled = settings.editorPaperBackground
    && !SHADER_UNSUPPORTED_THEMES.has(settings.themeId);
  const backgroundRef = useRef<HTMLDivElement>(null);
  const colors = useMemo(() => ({
    back: resolveThemeColor('--theme-canvas', '#f8f5ef'),
    front: resolveThemeColor('--theme-paper', '#fbfaf6'),
  }), [settings.appearanceColorSystem, settings.defineColorSettings, settings.themeId]);
  const baseImage = useMemo(() => paperTextureBaseImage(colors.back), [colors.back]);

  useEffect(() => {
    if (!shaderEnabled) return undefined;
    let animationFrame = 0;
    const deadline = performance.now() + 2_000;
    const rerenderShader = () => {
      const shaderElement = backgroundRef.current?.querySelector<HTMLElement>('.editor-paper-background-texture') as (HTMLElement & {
        paperShaderMount?: { setUniforms: (uniforms: Record<string, number>) => void };
      }) | null;
      const mount = shaderElement?.paperShaderMount;
      if (mount) {
        mount.setUniforms({
          u_contrast: PAPER_TEXTURE_PARAMS.contrast,
          u_roughness: PAPER_TEXTURE_PARAMS.roughness,
          u_fiber: PAPER_TEXTURE_PARAMS.fiber,
          u_fiberSize: PAPER_TEXTURE_PARAMS.fiberSize,
          u_crumples: PAPER_TEXTURE_PARAMS.crumples,
          u_crumpleSize: PAPER_TEXTURE_PARAMS.crumpleSize,
          u_folds: PAPER_TEXTURE_PARAMS.folds,
          u_foldCount: PAPER_TEXTURE_PARAMS.foldCount,
          u_fade: PAPER_TEXTURE_PARAMS.fade,
          u_drops: PAPER_TEXTURE_PARAMS.drops,
          u_seed: PAPER_TEXTURE_PARAMS.seed,
        });
        return;
      }
      if (performance.now() < deadline) {
        animationFrame = requestAnimationFrame(rerenderShader);
      }
    };
    animationFrame = requestAnimationFrame(rerenderShader);
    return () => cancelAnimationFrame(animationFrame);
  }, [colors, shaderEnabled]);

  return (
    <div ref={backgroundRef} className={`editor-paper-background${shaderEnabled ? ' is-textured' : ''}`}>
      {shaderEnabled && (
        <PaperTexture
          className="editor-paper-background-texture"
          aria-hidden="true"
          image={baseImage}
          colorBack={colors.back}
          colorFront={colors.front}
          {...PAPER_TEXTURE_PARAMS}
        />
      )}
      <div className="editor-paper-background-content">
        {children}
      </div>
    </div>
  );
}
