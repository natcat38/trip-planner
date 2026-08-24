// Shared User-Agent for every fetch in this directory. Third-party research
// APIs' usage policies (Overpass, Wikivoyage, and especially Transitous —
// see knowledge/integrations/transit-routing.md) ask for an application
// name, version, and contact so they can identify and, if needed, throttle
// or block a specific consumer instead of the whole internet.
//
// Version is a plain string constant, not `import`ed from package.json —
// pulling package.json into a server bundle for one string isn't worth it,
// and this file is already the single place to bump on a release.
const APP_VERSION = '0.1.0';

export const USER_AGENT = `trip-planner/${APP_VERSION} (+https://trip-planner-cyan-five.vercel.app)`;
