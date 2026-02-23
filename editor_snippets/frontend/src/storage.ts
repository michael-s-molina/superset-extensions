import { authentication } from '@apache-superset/core';
import { Snippet } from './types';

const SNIPPETS_ENDPOINT = '/extensions/editor_snippets';

export async function loadSnippets(): Promise<Snippet[]> {
  try {
    const csrfToken = await authentication.getCSRFToken();
    const response = await fetch(SNIPPETS_ENDPOINT, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrfToken!,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to load snippets: ${response.status}`);
    }

    const data = await response.json();
    return data.snippets ?? [];
  } catch (e) {
    console.warn('[Editor Snippets] Failed to load snippets:', e);
    return [];
  }
}

export async function saveSnippets(snippets: Snippet[]): Promise<void> {
  try {
    const csrfToken = await authentication.getCSRFToken();
    const response = await fetch(SNIPPETS_ENDPOINT, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrfToken!,
      },
      body: JSON.stringify({ snippets }),
    });

    if (!response.ok) {
      throw new Error(`Failed to save snippets: ${response.status}`);
    }
  } catch (e) {
    console.warn('[Editor Snippets] Failed to save snippets:', e);
    throw e;
  }
}

export function generateId(): string {
  return `snippet_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
