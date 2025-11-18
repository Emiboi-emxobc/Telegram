// location.js
import axios from "axios";

/**
 * Extract the real client IP from any request
 */
export function getClientIP(req) {
  return (
    req.headers["cf-connecting-ip"] ||   // Cloudflare
    req.headers["x-real-ip"] ||          // NGINX
    req.headers["x-forwarded-for"]?.split(",")[0] || 
    req.ip ||
    null
  );
}

/**
 * Lookup location using IPLocate.io (best free option w/ VPN detection)
 */
export async function lookupIPLocation(ip) {
  try {
    if (!ip) return null;

    const { data } = await axios.get(
      `https://www.iplocate.io/api/lookup/${ip}`,
      { timeout: 3000 }
    );

    return {
      ip: data.ip,
      city: data.city,
      region: data.subdivision,
      country: data.country,
      continent: data.continent,
      timezone: data.timezone,
      org: data.org,

      security: {
        is_vpn: data.security?.is_vpn || false,
        is_proxy: data.security?.is_proxy || false,
        is_tor: data.security?.is_tor || false,
      }
    };
  } catch (e) {
    console.warn("IP lookup failed:", e.message);
    return null;
  }
}

/**
 * Get fallback location from Cloudflare headers
 * Works even if user uses VPN/proxy
 */
export function cloudflareFallback(req) {
  return {
    country: req.headers["cf-ipcountry"] || null,
    region: req.headers["cf-region"] || null,
    city: req.headers["cf-city"] || null,
  };
}

/**
 * MAIN FUNCTION — handles everything:
 *   - real IP extract
 *   - IP lookup
 *   - VPN detection
 *   - Cloudflare fallback
 *   - normalized object ready to save
 */
export async function getFullLocation(req) {
  const ip = getClientIP(req);
  const primary = await lookupIPLocation(ip);
  const fallback = cloudflareFallback(req);

  return {
    ip: ip || null,

    city: primary?.city || fallback.city || null,
    region: primary?.region || fallback.region || null,
    country: primary?.country || fallback.country || null,

    timezone: primary?.timezone || null,
    continent: primary?.continent || null,
    org: primary?.org || null,

    vpn: primary?.security?.is_vpn || false,
    proxy: primary?.security?.is_proxy || false,
    tor: primary?.security?.is_tor || false,

    raw_primary: primary,     // optional debugging
    raw_fallback: fallback,   // optional debugging
  };
}