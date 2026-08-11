/**
 * Application-root wiring shared by every request: the Auth.js (Google +
 * GitHub, database sessions) configuration here, plus the route-protection
 * proxy in `src/proxy.ts` that gates access before a request reaches a page.
 * @packageDocumentation
 */
import { PrismaAdapter } from '@auth/prisma-adapter';
import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';
import { db } from './lib/db';

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: 'database' },
  providers: [Google, GitHub],
});
