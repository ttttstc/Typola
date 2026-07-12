import { deriveDefineTokens } from './deriveDefineTokens';
import type { DefineColorSettings } from './types';
import { syncDefineTitleBarColor } from '../windowChrome';

const appliedProperties = new WeakMap<Document, Set<string>>();

export function applyDefineColorToDocument(targetDocument: Document, settings: DefineColorSettings): void {
  const root = targetDocument.documentElement;
  const tokens = deriveDefineTokens(settings);
  root.dataset.colorSystem = 'define-color';
  root.dataset.colorScheme = 'light';
  root.style.colorScheme = 'light';
  const previous = appliedProperties.get(targetDocument) ?? new Set<string>();
  for (const property of previous) {
    if (!(property in tokens)) root.style.removeProperty(property);
  }
  const current = new Set<string>();
  for (const [property, value] of Object.entries(tokens)) {
    root.style.setProperty(property, value);
    current.add(property);
  }
  appliedProperties.set(targetDocument, current);
  syncDefineTitleBarColor(settings);
}

export function clearDefineColorFromDocument(targetDocument: Document): void {
  const root = targetDocument.documentElement;
  for (const property of appliedProperties.get(targetDocument) ?? []) root.style.removeProperty(property);
  appliedProperties.delete(targetDocument);
}
