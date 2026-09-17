/**
 * Cloudflare Access JWT validation.
 *
 * Access sits in front of a single dedicated route (see `worker/app.ts`,
 * `/auth/access/callback`) and forwards the request to the Worker only after
 * its own hosted login succeeds, attaching a signed `CF_Authorization` JWT.
 * This module verifies that JWT against the team's JWKS before the callback
 * handler JIT-provisions the user via the existing `AuthService`.
 */

import {
	createRemoteJWKSet,
	jwtVerify,
	type JWTPayload,
	type JWTVerifyGetKey,
} from 'jose';
import { createLogger } from '../../logger';

const logger = createLogger('AccessAuth');

export interface AccessIdentity {
	sub: string;
	email: string;
	name?: string;
}

/**
 * `Access` login requires all three of `ACCESS_ENABLED`, `ACCESS_TEAM_DOMAIN`,
 * and `ACCESS_AUD` to be set. `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD` are dashboard
 * secrets / `.dev.vars` locally, never committed to `wrangler.jsonc`.
 */
export function isAccessLoginEnabled(env: Env): boolean {
	return (
		env.ACCESS_ENABLED === 'true' &&
		!!env.ACCESS_TEAM_DOMAIN &&
		!!env.ACCESS_AUD
	);
}

/**
 * Cloudflare Access's logout endpoint, scoped to our own application domain
 * rather than the team domain. `/cdn-cgi/access/logout` has no redirect
 * parameter — it's a same-origin cookie-clearing endpoint Access injects at
 * the edge — so the frontend calls it via `fetch` in the background instead
 * of navigating the browser away to `<team>.cloudflareaccess.com`.
 */
export function buildAccessLogoutUrl(env: Env): string | null {
	if (!env.ACCESS_TEAM_DOMAIN) {
		return null;
	}
	return '/cdn-cgi/access/logout';
}

/**
 * Access forwards the JWT via the `Cf-Access-Jwt-Assertion` header on the
 * request it proxies to the origin, and also sets it as the `CF_Authorization`
 * cookie in the browser. Prefer the header; fall back to the cookie.
 */
export function extractAccessJwt(request: Request): string | null {
	const header = request.headers.get('Cf-Access-Jwt-Assertion');
	if (header) {
		return header;
	}

	const cookieHeader = request.headers.get('Cookie');
	if (!cookieHeader) {
		return null;
	}
	const match = cookieHeader.match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
	return match ? decodeURIComponent(match[1]) : null;
}

// `createRemoteJWKSet` caches fetched keys and handles rotation internally;
// jose's own docs recommend keeping one instance alive across invocations in
// serverless environments rather than re-fetching the JWKS per request.
let cachedJWKS: JWTVerifyGetKey | null = null;
let cachedTeamDomain: string | null = null;

function getJWKS(teamDomain: string): JWTVerifyGetKey {
	if (!cachedJWKS || cachedTeamDomain !== teamDomain) {
		cachedJWKS = createRemoteJWKSet(
			new URL(`https://${teamDomain}/cdn-cgi/access/certs`),
		);
		cachedTeamDomain = teamDomain;
	}
	return cachedJWKS;
}

/** Test-only: clear the module-level JWKS cache between test cases. */
export function resetAccessJwksCacheForTests(): void {
	cachedJWKS = null;
	cachedTeamDomain = null;
}

function extractIdentity(payload: JWTPayload): AccessIdentity {
	const email = typeof payload.email === 'string' ? payload.email : undefined;
	if (!email) {
		throw new Error('Access JWT is missing the email claim');
	}
	return {
		sub: typeof payload.sub === 'string' ? payload.sub : email,
		email,
		name: typeof payload.name === 'string' ? payload.name : undefined,
	};
}

/**
 * Verify the Access JWT on `request` against the configured team's JWKS,
 * checking issuer and audience, and return the validated identity.
 * Throws on any missing/invalid/expired/wrong-audience token.
 */
export async function verifyAccessJwt(
	env: Env,
	request: Request,
): Promise<AccessIdentity> {
	if (!isAccessLoginEnabled(env)) {
		throw new Error(
			'Cloudflare Access login is not enabled on this deployment',
		);
	}

	const token = extractAccessJwt(request);
	if (!token) {
		throw new Error('Missing Access JWT assertion');
	}

	const teamDomain = env.ACCESS_TEAM_DOMAIN;
	const jwks = getJWKS(teamDomain);

	try {
		const { payload } = await jwtVerify(token, jwks, {
			issuer: `https://${teamDomain}`,
			audience: env.ACCESS_AUD,
		});
		return extractIdentity(payload);
	} catch (error) {
		logger.warn('Access JWT verification failed', {
			error: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}
}
