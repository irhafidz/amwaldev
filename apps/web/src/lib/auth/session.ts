import { createServerFn } from '@tanstack/react-start';
import { getWebRequest } from '@tanstack/react-start/server';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { users } from '../db/schema';
import { auth } from './index';
import { cacheProfile, getCachedProfile } from './profile-cache';
import type { SessionUser } from './types';

/**
 * Resolves the signed-in user for the router context from the httpOnly
 * `amwal_token` cookie, enriching it with the latest user profile (name, email)
 * from the database.
 *
 * Implemented as a server function so the router can call it in both
 * environments it runs in: during SSR the handler executes in-process with the
 * incoming request, and on client-side navigation the browser calls the
 * server-function endpoint — a same-origin request, so the cookie rides along.
 * Never returns the token itself, only the derived `SessionUser`.
 */
export const fetchSessionUser = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SessionUser | null> => {
    const request = getWebRequest();
    const session = await auth.api.getSession({ headers: request?.headers });
    if (!session.user) {
      return null;
    }

    const cachedProfile = getCachedProfile(session.user.userId);
    if (cachedProfile) {
      return { ...session.user, ...cachedProfile };
    }

    try {
      const userRecord = await db.query.users.findFirst({
        where: eq(users.id, session.user.userId),
        columns: {
          name: true,
          email: true,
          phone: true,
        },
      });

      const profile = {
        name: userRecord?.name ?? undefined,
        email: userRecord?.email ?? undefined,
        phone: userRecord?.phone ?? undefined,
      };
      cacheProfile(session.user.userId, profile);
      return { ...session.user, ...profile };
    } catch {
      return session.user;
    }
  }
);
