import type katex from 'katex';
import katexCssUrl from 'katex/dist/katex.min.css?url';

let katexPromise: Promise<typeof katex> | null = null;
let katexCssLoaded = false;

function loadKatexCss(): void {
  if (katexCssLoaded) return;
  katexCssLoaded = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = katexCssUrl;
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
