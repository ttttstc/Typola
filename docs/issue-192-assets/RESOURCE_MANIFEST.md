# Issue #192 Define Edit Theme Color — Resource Manifest

This manifest is the source-of-truth inventory for the Define theme editor replication.

## Local source root

```text
D:\AI\workspace\new\define-clone
```

## Direct-copy runtime assets

| Local source | Target path | Action |
|---|---|---|
| `D:\AI\workspace\new\define-clone\color_theme_editor_dots_pattern.png` | `src/assets/define-color/editor-dots-pattern.png` | Copy byte-for-byte; do not redraw or recompress |
| `D:\AI\workspace\new\define-clone\color_theme_editor_transparent_pattern.png` | `src/assets/define-color/transparent-pattern.png` | Copy byte-for-byte; do not redraw or recompress |

Expected metadata:

- `color_theme_editor_dots_pattern.png`: 596×596 RGBA, SHA-256 `882e8f27da5c74e297f19a6c19fc3faa6bb824c274944d3f2a7c7d66919899fe`
- `color_theme_editor_transparent_pattern.png`: 316×112 RGBA, SHA-256 `f2620377e6bfa702ae633db347c2024c4e2689dcbe973e681734ad7bef6caaf3`

## Implementation truth sources — inspect/extract, do not import at runtime

| Local source | What to extract |
|---|---|
| `D:\AI\workspace\new\define-clone\_next\static\chunks\565-418241a4ad8c014e.js` | ThemeEditor UI, 50 presets, Hue Wheel geometry, gradient offset, saturation gesture, Surprise me, pattern order, inline SVG icons |
| `D:\AI\workspace\new\define-clone\_next\static\chunks\app\demo\page-d3ddeea70dde1cf0.js` | Global gradient/pattern composition and application to the demo shell |
| `D:\AI\workspace\new\define-clone\_next\static\css\80df04630f41ade0.css` | Exact editor dimensions, radius, shadow, spacing, handles, controls, transitions |
| `D:\AI\workspace\new\define-clone\_next\static\css\9125ecd63e7ae0ac.css` | Neutral palette, common background/text/icon/border variables |

Search index inside `565-418241a4ad8c014e.js`:

- module `4991`: ThemeEditor component, heavy/light swatches, presets, Hue Wheel and randomizer
- module `44114`: OKLCH derived-token calculation and CSS variable application
- module `51436`: editor state
- module `70155`: pattern order and `/patterns/*.png` mapping
- module `45398`: CSS-module class mapping
- search terms: `Heavy-1`, `Apply gradient`, `Adjust saturation`, `Surprise me`, `Before random theme`, `patternOpacity`, `Randomize theme`

## Inline vector assets to extract from source

Extract and rebuild as React SVG components; do not replace with generic Lucide icons:

| Source | Target |
|---|---|
| Surprise-me dice SVG/SMIL near `aria-label:"Randomize theme"` in module `4991` | `src/components/defineColor/icons/SurpriseDiceIcon.tsx` |
| Gradient toggle DOM/CSS around `themeEditorGradientToggleIconDots` | `src/components/defineColor/icons/GradientModeIcon.tsx` |
| Saturation drop DOM/CSS around `themeEditorSaturationDropBase` and its clip path | `src/components/defineColor/icons/SaturationDropIcon.tsx` |

## Required pattern runtime assets

Official source URLs referenced by module `70155`:

```text
/patterns/stripe.png
/patterns/liquid.png
/patterns/warp.png
/patterns/noise.png
/patterns/starlight.png
/patterns/dots.png
/patterns/dots-2.png
/patterns/define.png
```

Check first:

```text
D:\AI\workspace\new\define-clone\patterns
```

Official target paths:

```text
src/assets/define-color/patterns/stripe.png
src/assets/define-color/patterns/liquid.png
src/assets/define-color/patterns/warp.png
src/assets/define-color/patterns/noise.png
src/assets/define-color/patterns/starlight.png
src/assets/define-color/patterns/dots.png
src/assets/define-color/patterns/dots-2.png
src/assets/define-color/patterns/define.png
```

If official PNGs are absent, use the fallback SVG files in this branch under `docs/issue-192-assets/`, either directly as CSS background resources or convert them to 256×256 transparent PNGs. Architecture and state must not change when official assets are later substituted.

## Fallback asset files in this branch

```text
docs/issue-192-assets/stripe.svg
docs/issue-192-assets/liquid.svg
docs/issue-192-assets/warp.svg
docs/issue-192-assets/noise.svg
docs/issue-192-assets/starlight.svg
docs/issue-192-assets/dots.svg
docs/issue-192-assets/dots-2.svg
docs/issue-192-assets/define.svg
```

Visual previews:

| Stripe | Liquid | Warp | Noise |
|---|---|---|---|
| ![stripe](https://raw.githubusercontent.com/ttttstc/Typola/issue-192-handoff-assets/docs/issue-192-assets/stripe.svg) | ![liquid](https://raw.githubusercontent.com/ttttstc/Typola/issue-192-handoff-assets/docs/issue-192-assets/liquid.svg) | ![warp](https://raw.githubusercontent.com/ttttstc/Typola/issue-192-handoff-assets/docs/issue-192-assets/warp.svg) | ![noise](https://raw.githubusercontent.com/ttttstc/Typola/issue-192-handoff-assets/docs/issue-192-assets/noise.svg) |

| Starlight | Dots | Dots Alt | Define |
|---|---|---|---|
| ![starlight](https://raw.githubusercontent.com/ttttstc/Typola/issue-192-handoff-assets/docs/issue-192-assets/starlight.svg) | ![dots](https://raw.githubusercontent.com/ttttstc/Typola/issue-192-handoff-assets/docs/issue-192-assets/dots.svg) | ![dots-2](https://raw.githubusercontent.com/ttttstc/Typola/issue-192-handoff-assets/docs/issue-192-assets/dots-2.svg) | ![define](https://raw.githubusercontent.com/ttttstc/Typola/issue-192-handoff-assets/docs/issue-192-assets/define.svg) |

Checkout command:

```bash
git fetch origin issue-192-handoff-assets
git checkout origin/issue-192-handoff-assets -- docs/issue-192-assets
```

A Windows copy helper is also included:

```text
docs/issue-192-assets/COPY_FROM_LOCAL.ps1
```

Run from the repository root after checking out the branch assets:

```powershell
powershell -ExecutionPolicy Bypass -File .\docs\issue-192-assets\COPY_FROM_LOCAL.ps1
```

## Optional references — not required runtime assets

| Local source | Status |
|---|---|
| `D:\AI\workspace\new\define-clone\define_logo_bw.png` | Optional visual reference only; not needed for the editor runtime |
| `D:\AI\workspace\new\define-clone\favicon.ico` | Do not reuse |
| `D:\AI\workspace\new\define-clone\index.html` | Bootstrap/reference only; do not copy into Typola |
| `D:\AI\workspace\new\define-clone\_next\static\media\*.woff2` | Do not copy; use Typola's existing font system |
| all other `_next/static/chunks/*.js` | Not required unless an unresolved dependency is discovered during extraction |
| all other `_next/static/css/*.css` | Not required unless a referenced class/token cannot be resolved from the two primary CSS files |

## Target asset tree

Official-image path:

```text
src/assets/define-color/
  editor-dots-pattern.png
  transparent-pattern.png
  patterns/
    stripe.png
    liquid.png
    warp.png
    noise.png
    starlight.png
    dots.png
    dots-2.png
    define.png
```

Fallback path is the same tree using `.svg` files until official PNGs are recovered.

## Completion rule

Implementation is not resource-complete until:

1. both direct-copy PNGs are present and verified;
2. all three vector icons are extracted/rebuilt;
3. all eight pattern resources exist in the target tree, official or declared fallback;
4. the PR states whether official or fallback pattern assets were used.
