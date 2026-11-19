// How long a sign-in lasts (D-68, superseding D-53's flat 30 days).
//   Not remembered (the default): ends after IDLE_MS without use. Each token refresh
//   (at least every 15 minutes of use, when the access token runs out) moves the end
//   forward, so it only ends when the app sits unused.
//   "Keep me signed in on this device": a fixed 30 days, as before.
// The client also signs out an open but untouched tab after the same idle time,
// because background refreshes from live updates would otherwise keep it alive.

export const IDLE_MS = 60 * 60 * 1000
export const REMEMBER_MS = 30 * 24 * 60 * 60 * 1000

export const sessionExpiry = (remember, now = Date.now()) => new Date(now + (remember ? REMEMBER_MS : IDLE_MS))
