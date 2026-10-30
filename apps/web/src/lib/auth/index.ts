import { getWebRequest } from '@tanstack/react-start/server';
import { verifyAccessToken } from './core';
import type { SessionUser } from './types';

function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) {
      return decodeURIComponent(rest.join('='));
    }
  }

  return null;
}

export const auth = {
  api: {
    getSession: async (options?: {
      headers?: Headers;
    }): Promise<{ user: SessionUser | null }> => {
      try {
        const request = getWebRequest();
        const headers = options?.headers ?? request?.headers;
        const token = readCookie(headers?.get('cookie') ?? null, 'amwal_token');
        if (!token) {
          return { user: null };
        }

        const user = await verifyAccessToken(token);
        return { user };
      } catch (_error) {
        return { user: null };
      }
    },
  },
};
