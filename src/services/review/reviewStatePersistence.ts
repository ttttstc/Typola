import type { SelectionAnchor } from '../agent/types';
import type { ReviewBasis, ReviewComment, ReviewStateSnapshot } from './reviewState';

export const REVIEW_STATE_STORAGE_PREFIX = 'typola.review-state.v1:';

const REVIEW_BLOCK_KINDS = new Set<NonNullable<SelectionAnchor['block']>['kind']>([
  'code',
  'table',
  'math',
  'mermaid',
  'section',
  'paragraph',
]);

export function normalizeReviewDocumentPath(filePath: string): string {
  const normalized = filePath.replace(/\\/gu, '/');
  if (typeof navigator !== 'undefined' && /windows|win32|win64/iu.test(`${navigator.platform} ${navigator.userAgent}`)) {
    return normalized.toLowerCase();
  }
  return normalized;
}

export function reviewStateStorageKey(filePath: string): string {
  return `${REVIEW_STATE_STORAGE_PREFIX}${normalizeReviewDocumentPath(filePath)}`;
}

export function loadReviewState(filePath: string | undefined): ReviewStateSnapshot | undefined {
  if (!filePath || typeof localStorage === 'undefined') return undefined;
  try {
    const value: unknown = JSON.parse(localStorage.getItem(reviewStateStorageKey(filePath)) ?? 'null');
    if (!isPersistedReviewState(value)) return undefined;
    return {
      comments: value.comments,
      dirty: value.dirty,
    };
  } catch {
    return undefined;
  }
}

export function saveReviewState(filePath: string | undefined, state: ReviewStateSnapshot): void {
  if (!filePath || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(reviewStateStorageKey(filePath), JSON.stringify({
      version: 1,
      comments: state.comments,
      dirty: state.dirty,
    }));
  } catch {
    return;
  }
}

export function removeReviewStatesUnder(path: string | undefined): void {
  if (!path || typeof localStorage === 'undefined') return;
  const normalizedPath = normalizeReviewDocumentPath(path).replace(/\/+$/u, '');
  const nestedPrefix = `${normalizedPath}/`;
  const keysToRemove: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key || !key.startsWith(REVIEW_STATE_STORAGE_PREFIX)) continue;
    const storedPath = key.slice(REVIEW_STATE_STORAGE_PREFIX.length);
    if (storedPath === normalizedPath || storedPath.startsWith(nestedPrefix)) keysToRemove.push(key);
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
}

function isPersistedReviewState(value: unknown): value is { version: 1; comments: ReviewComment[]; dirty: boolean } {
  if (!isRecord(value) || value.version !== 1 || typeof value.dirty !== 'boolean' || !Array.isArray(value.comments)) {
    return false;
  }
  return value.comments.every(isReviewComment);
}

function isReviewComment(value: unknown): value is ReviewComment {
  if (!isRecord(value)) return false;
  if (
    typeof value.id !== 'string'
    || typeof value.filePath !== 'string'
    || typeof value.text !== 'string'
    || !isFiniteNumber(value.createdAt)
    || (value.source !== 'human' && value.source !== 'ai')
    || (value.status !== 'active' && value.status !== 'ignored')
    || !isSelectionAnchor(value.anchor)
  ) return false;
  if (value.basis !== undefined && !isReviewBasis(value.basis)) return false;
  return value.appliedAt === undefined || isFiniteNumber(value.appliedAt);
}

function isSelectionAnchor(value: unknown): value is SelectionAnchor {
  if (!isRecord(value)) return false;
  if (
    typeof value.filePath !== 'string'
    || !isFiniteNumber(value.from)
    || !isFiniteNumber(value.to)
    || typeof value.originalText !== 'string'
  ) return false;
  if (value.prefixHint !== undefined && typeof value.prefixHint !== 'string') return false;
  if (value.headingPath !== undefined && (
    !Array.isArray(value.headingPath)
    || !value.headingPath.every((part) => typeof part === 'string')
  )) return false;
  if (value.block !== undefined && !isReviewBlock(value.block)) return false;
  return true;
}

function isReviewBlock(value: unknown): value is NonNullable<SelectionAnchor['block']> {
  if (!isRecord(value)) return false;
  return REVIEW_BLOCK_KINDS.has(value.kind as NonNullable<SelectionAnchor['block']>['kind'])
    && isFiniteNumber(value.from)
    && isFiniteNumber(value.to);
}

function isReviewBasis(value: unknown): value is ReviewBasis {
  if (!isRecord(value)) return false;
  return (
    (value.kind === 'style' || value.kind === 'skill' || value.kind === 'request')
    && typeof value.label === 'string'
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
