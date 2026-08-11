/**
 * The Auth.js catch-all API route: forwards GET/POST to the handlers built
 * from the shared config in `src/auth.ts`, giving every OAuth callback a URL.
 * @packageDocumentation
 */
import { handlers } from '@/auth';

export const { GET, POST } = handlers;
