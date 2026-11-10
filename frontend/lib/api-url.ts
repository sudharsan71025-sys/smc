/**
 * Resolves the backend API base URL dynamically.
 *
 * 1. If NEXT_PUBLIC_API_URL is set to a public URL (e.g. on Render), use it.
 * 2. If running on Render (*.onrender.com) and env var is missing, default to the live Render backend.
 * 3. If accessed via local private Wi-Fi IP (192.168.x.x) on mobile, use that machine's IP on port 5000.
 * 4. Otherwise fallback to local development port 5000.
 */
export function getApiBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;

  // 1. If explicitly set to a remote public URL (Render, Vercel, custom domain)
  if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
    return envUrl;
  }

  // 2. Client-side browser runtime resolution
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;

    // A. If hosted on Render (e.g. smc-frontend-cbou.onrender.com)
    if (hostname.endsWith('.onrender.com')) {
      return 'https://smc-backend-gt5i.onrender.com/api/v1';
    }

    // B. If accessed via local network IP (e.g., mobile testing at 192.168.0.4:3000)
    const isPrivateIp =
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname);

    if (isPrivateIp) {
      return `${protocol}//${hostname}:5000/api/v1`;
    }
  }

  // 3. Fallback for desktop localhost development
  return envUrl || 'http://localhost:5000/api/v1';
}
