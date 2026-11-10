/**
 * Resolves the backend API base URL dynamically.
 *
 * If accessed on desktop localhost -> http://localhost:5000/api/v1
 * If accessed on mobile via Wi-Fi IP (e.g. 192.168.0.4:3000) -> http://192.168.0.4:5000/api/v1
 * If deployed remotely (Render / Vercel) -> process.env.NEXT_PUBLIC_API_URL
 */
export function getApiBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;

  // In browser runtime
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;

    // When accessed from another device on the local network (e.g., mobile phone via 192.168.x.x)
    // and envUrl is either unset or pointing to localhost/127.0.0.1:
    if (
      hostname !== 'localhost' &&
      hostname !== '127.0.0.1' &&
      (!envUrl || envUrl.includes('localhost') || envUrl.includes('127.0.0.1'))
    ) {
      const protocol = window.location.protocol;
      return `${protocol}//${hostname}:5000/api/v1`;
    }
  }

  return envUrl || 'http://localhost:5000/api/v1';
}
