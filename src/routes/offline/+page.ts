// A minimal, prerendered offline fallback. The service worker serves this page when
// navigation is attempted offline and the specific route is not in the cache.
//
// It contains no data access; it just reassures the user and links back to the app
// shell (which IS cached) so client-side routing can take over once loaded.
export const prerender = true;
