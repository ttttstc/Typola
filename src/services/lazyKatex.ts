import type katex from 'katex';

let katexPromise: Promise<typeof katex> | null = null;
let katexCssLoaded = false;

function loadKatexCss(): void {
  if (katexCssLoaded) return;
  katexCssLoaded = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css';
  link.media = 'print';
  link.onload = () => { link.media = 'all'; };
  document.head.appendChild(link);
}

export async function loadKatex(): Promise<typeof katex> {
  loadKatexCss();
  if (!katexPromise) {
    katexPromise = import('katex').then((m) => m.default as typeof katex);
  }
  return katexPromise;
}
