export function register() {
  if (process.env.NEXT_RUNTIME !== 'edge') {
    process.env.TZ = 'UTC';
  }
}
