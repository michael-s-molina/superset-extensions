import { Snippet } from './types';

const STORAGE_KEY = 'sqllab_snippets';

export function loadSnippets(): Snippet[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveSnippets(snippets: Snippet[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snippets));
  } catch (e) {
    console.warn('[SQL Snippets] Failed to save to localStorage:', e);
  }
}

export function generateId(): string {
  return `snippet_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
