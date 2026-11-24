/** Shared with the browser for early feedback. The server re-validates everything (never trust the client). */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/**
 * Hosts such as Vercel reject request bodies above ~4.5 MB. The browser therefore shrinks big photos
 * and refuses anything still above this value. (The server limit stays 5 MB for other hosts.)
 */
export const HOSTED_UPLOAD_LIMIT = 4_400_000;
/** Photos above this are re-encoded in the browser before upload. */
export const SHRINK_ABOVE = 2_500_000;
