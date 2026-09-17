import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	SignJWT,
	generateKeyPair,
	exportJWK,
	type JWK,
	type KeyLike,
} from 'jose';
import {
	verifyAccessJwt,
	isAccessLoginEnabled,
	buildAccessLogoutUrl,
	extractAccessJwt,
	resetAccessJwksCacheForTests,
} from './accessAuth';

const TEAM_DOMAIN = 'team.cloudflareaccess.com';
const AUD = 'test-aud';
const KID = 'test-key';

function makeEnv(overrides: Partial<Env> = {}): Env {
	return {
		ACCESS_ENABLED: 'true',
		ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
		ACCESS_AUD: AUD,
		...overrides,
	} as unknown as Env;
}

describe('accessAuth', () => {
	let privateKey: KeyLike;
	let publicJwk: JWK;

	beforeEach(async () => {
		resetAccessJwksCacheForTests();

		const { publicKey, privateKey: pk } = await generateKeyPair('RS256');
		privateKey = pk;
		publicJwk = await exportJWK(publicKey);
		publicJwk.kid = KID;
		publicJwk.alg = 'RS256';
		publicJwk.use = 'sig';

		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: string | URL | Request) => {
				const url =
					typeof input === 'string' ? input : input.toString();
				if (url.includes('/cdn-cgi/access/certs')) {
					return new Response(JSON.stringify({ keys: [publicJwk] }), {
						status: 200,
						headers: { 'content-type': 'application/json' },
					});
				}
				throw new Error(`Unexpected fetch in test: ${url}`);
			}),
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		resetAccessJwksCacheForTests();
	});

	async function signToken(
		overrides: {
			claims?: Record<string, unknown>;
			aud?: string;
			issuer?: string;
			iat?: number;
			exp?: string | number;
		} = {},
	): Promise<string> {
		let jwt = new SignJWT({
			email: 'attendee@example.com',
			...overrides.claims,
		})
			.setProtectedHeader({ alg: 'RS256', kid: KID })
			.setIssuer(overrides.issuer ?? `https://${TEAM_DOMAIN}`)
			.setAudience(overrides.aud ?? AUD)
			.setSubject('access-sub-1');

		jwt =
			overrides.iat !== undefined
				? jwt.setIssuedAt(overrides.iat)
				: jwt.setIssuedAt();
		jwt = jwt.setExpirationTime(overrides.exp ?? '5m');

		return jwt.sign(privateKey);
	}

	describe('isAccessLoginEnabled', () => {
		it('is true only when enabled and both config vars are set', () => {
			expect(isAccessLoginEnabled(makeEnv())).toBe(true);
			expect(
				isAccessLoginEnabled(makeEnv({ ACCESS_ENABLED: 'false' })),
			).toBe(false);
			expect(
				isAccessLoginEnabled(makeEnv({ ACCESS_ENABLED: undefined })),
			).toBe(false);
			expect(
				isAccessLoginEnabled(
					makeEnv({ ACCESS_TEAM_DOMAIN: undefined }),
				),
			).toBe(false);
			expect(
				isAccessLoginEnabled(makeEnv({ ACCESS_AUD: undefined })),
			).toBe(false);
		});
	});

	describe('buildAccessLogoutUrl', () => {
		it('returns the same-origin logout path when a team domain is configured', () => {
			expect(buildAccessLogoutUrl(makeEnv())).toBe(
				'/cdn-cgi/access/logout',
			);
		});

		it('returns null without a team domain', () => {
			expect(
				buildAccessLogoutUrl(
					makeEnv({ ACCESS_TEAM_DOMAIN: undefined }),
				),
			).toBeNull();
		});
	});

	describe('extractAccessJwt', () => {
		it('prefers the Cf-Access-Jwt-Assertion header over the cookie', () => {
			const request = new Request(
				'https://app.local/auth/access/callback',
				{
					headers: {
						'Cf-Access-Jwt-Assertion': 'header-token',
						Cookie: 'CF_Authorization=cookie-token',
					},
				},
			);
			expect(extractAccessJwt(request)).toBe('header-token');
		});

		it('falls back to the CF_Authorization cookie', () => {
			const request = new Request(
				'https://app.local/auth/access/callback',
				{
					headers: {
						Cookie: 'foo=bar; CF_Authorization=cookie-token; baz=qux',
					},
				},
			);
			expect(extractAccessJwt(request)).toBe('cookie-token');
		});

		it('returns null when neither is present', () => {
			const request = new Request(
				'https://app.local/auth/access/callback',
			);
			expect(extractAccessJwt(request)).toBeNull();
		});
	});

	describe('verifyAccessJwt', () => {
		it('accepts a valid Access JWT and extracts the identity', async () => {
			const token = await signToken();
			const request = new Request(
				'https://app.local/auth/access/callback',
				{
					headers: { 'Cf-Access-Jwt-Assertion': token },
				},
			);

			const identity = await verifyAccessJwt(makeEnv(), request);
			expect(identity).toEqual({
				sub: 'access-sub-1',
				email: 'attendee@example.com',
				name: undefined,
			});
		});

		it('extracts the identity from the CF_Authorization cookie', async () => {
			const token = await signToken();
			const request = new Request(
				'https://app.local/auth/access/callback',
				{
					headers: { Cookie: `CF_Authorization=${token}` },
				},
			);

			const identity = await verifyAccessJwt(makeEnv(), request);
			expect(identity.email).toBe('attendee@example.com');
		});

		it('rejects an expired JWT', async () => {
			const now = Math.floor(Date.now() / 1000);
			const token = await signToken({ iat: now - 3600, exp: now - 1800 });
			const request = new Request(
				'https://app.local/auth/access/callback',
				{
					headers: { 'Cf-Access-Jwt-Assertion': token },
				},
			);

			await expect(verifyAccessJwt(makeEnv(), request)).rejects.toThrow();
		});

		it('rejects a JWT with the wrong audience', async () => {
			const token = await signToken({ aud: 'wrong-aud' });
			const request = new Request(
				'https://app.local/auth/access/callback',
				{
					headers: { 'Cf-Access-Jwt-Assertion': token },
				},
			);

			await expect(verifyAccessJwt(makeEnv(), request)).rejects.toThrow();
		});

		it('rejects a JWT from the wrong issuer', async () => {
			const token = await signToken({
				issuer: 'https://someone-else.cloudflareaccess.com',
			});
			const request = new Request(
				'https://app.local/auth/access/callback',
				{
					headers: { 'Cf-Access-Jwt-Assertion': token },
				},
			);

			await expect(verifyAccessJwt(makeEnv(), request)).rejects.toThrow();
		});

		it('rejects a JWT missing the email claim', async () => {
			const token = await new SignJWT({})
				.setProtectedHeader({ alg: 'RS256', kid: KID })
				.setIssuer(`https://${TEAM_DOMAIN}`)
				.setAudience(AUD)
				.setSubject('access-sub-1')
				.setIssuedAt()
				.setExpirationTime('5m')
				.sign(privateKey);
			const request = new Request(
				'https://app.local/auth/access/callback',
				{
					headers: { 'Cf-Access-Jwt-Assertion': token },
				},
			);

			await expect(verifyAccessJwt(makeEnv(), request)).rejects.toThrow();
		});

		it('rejects when no JWT is present on the request', async () => {
			const request = new Request(
				'https://app.local/auth/access/callback',
			);
			await expect(verifyAccessJwt(makeEnv(), request)).rejects.toThrow();
		});

		it('rejects when Access login is not enabled', async () => {
			const token = await signToken();
			const request = new Request(
				'https://app.local/auth/access/callback',
				{
					headers: { 'Cf-Access-Jwt-Assertion': token },
				},
			);

			await expect(
				verifyAccessJwt(makeEnv({ ACCESS_ENABLED: 'false' }), request),
			).rejects.toThrow();
		});
	});
});
