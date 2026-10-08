import { PithClient } from '@pith/sdk';

const API_BASE = typeof window !== 'undefined' ? '/api' : (process.env.API_URL || 'http://127.0.0.1:8000');

export const pithApi = new PithClient({
  baseUrl: API_BASE,
});

export * from '@pith/sdk';
