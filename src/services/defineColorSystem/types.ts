export type AppearanceColorSystem = 'static-theme' | 'define-color';

export type DefinePattern =
  | 'none'
  | 'stripe'
  | 'liquid'
  | 'warp'
  | 'noise'
  | 'starlight'
  | 'dots'
  | 'dots-2'
  | 'define';

export type OklchColor = { l: number; c: number; h: number };

export type DefineColorSettings = OklchColor & {
  version: 1 | 2;
  isGradient: boolean;
  opacity: number;
  saturation: number;
  pattern: DefinePattern;
  patternOpacity: number;
  currentPresetIndex: number | null;
};
