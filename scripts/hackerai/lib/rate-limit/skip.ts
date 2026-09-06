/**
 * Personal installations are single-owner deployments and do not require the
 * hosted Redis-backed quota service. Keep this explicit so production builds
 * retain normal enforcement everywhere else.
 */
export const shouldSkipRateLimits = (): boolean =>
  process.env.PERSONAL_MODE === "true" ||
  process.env.NEXT_PUBLIC_PERSONAL_MODE === "true" ||
  process.env.NODE_ENV !== "production";