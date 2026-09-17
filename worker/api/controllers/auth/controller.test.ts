import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthController } from './controller';
import type { RouteContext } from '../../types/route-context';

const {
	mockGetOAuthAuthorizationUrl,
	mockHandleOAuthCallback,
	mockGetPendingLinkUserId,
	mockProvisionFromToken,
	mockHandleAccessLogin,
	mockVerifyAccessJwt,
} = vi.hoisted(() => ({
	mockGetOAuthAuthorizationUrl: vi.fn(),
	mockHandleOAuthCallback: vi.fn(),
	mockGetPendingLinkUserId: vi.fn(),
	mockProvisionFromToken: vi.fn(),
	mockHandleAccessLogin: vi.fn(),
	mockVerifyAccessJwt: vi.fn(),
}));

vi.mock('../../../database/services/AuthService', () => ({
	AuthService: vi.fn().mockImplementation(() => ({
		getOAuthAuthorizationUrl: mockGetOAuthAuthorizationUrl,
		handleOAuthCallback: mockHandleOAuthCallback,
		getPendingLinkUserId: mockGetPendingLinkUserId,
		handleAccessLogin: mockHandleAccessLogin,
	})),
}));

vi.mock('../../../services/cloudflare/CloudflareProvisioningService', () => ({
	CloudflareProvisioningService: vi.fn().mockImplementation(() => ({
		provisionFromToken: mockProvisionFromToken,
	})),
}));

// Only the JWKS-verifying half is mocked (its own JWT valid/expired/wrong-aud
// coverage lives in accessAuth.test.ts); `isAccessLoginEnabled` and
// `buildAccessLogoutUrl` stay real so tests can drive them via env vars.
vi.mock('../../../middleware/auth/accessAuth', async () => {
	const actual = await vi.importActual<
		typeof import('../../../middleware/auth/accessAuth')
	>('../../../middleware/auth/accessAuth');
	return {
		...actual,
		verifyAccessJwt: mockVerifyAccessJwt,
	};
});

const BASE_URL = 'https://app.local';

const testEnv = {
	ENVIRONMENT: 'dev',
	ENABLE_CLOUDFLARE_LIMITS: 'true',
	CF_OAUTH_ENCRYPTION_KEY: 'test-oauth-encryption-key-0123456789abcdef',
	CLOUDFLARE_OAUTH_CLIENT_ID: 'cf-client-id',
	CLOUDFLARE_OAUTH_CLIENT_SECRET: 'cf-client-secret',
	JWT_SECRET: 'Test-Secret-1234567890-abcdefghijklmnop-!@#$',
} as unknown as Env;

function makeContext(overrides: Partial<RouteContext> = {}): RouteContext {
	return {
		user: { id: 'user-1', email: 'user@example.com' },
		sessionId: 'session-1',
		config: {},
		pathParams: {},
		queryParams: new URLSearchParams(),
		...overrides,
	} as unknown as RouteContext;
}

describe('AuthController.initiateOAuth failure', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns a structured error response', async () => {
		mockGetOAuthAuthorizationUrl.mockRejectedValue(
			new Error('provider misconfigured'),
		);

		const response = await AuthController.initiateOAuth(
			new Request(`${BASE_URL}/api/auth/oauth/cloudflare`),
			testEnv,
			{} as ExecutionContext,
			makeContext({ pathParams: { provider: 'cloudflare' } }),
		);

		expect(response.status).toBe(500);
		expect(await response.json()).toMatchObject({
			success: false,
			message: 'An error occurred',
		});
	});
});

describe('AuthController.initiateProviderLink failure', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns a structured error response', async () => {
		mockGetOAuthAuthorizationUrl.mockRejectedValue(
			new Error('provider misconfigured'),
		);

		const response = await AuthController.initiateProviderLink(
			new Request(`${BASE_URL}/api/auth/link/cloudflare`),
			testEnv,
			{} as ExecutionContext,
			makeContext({ pathParams: { provider: 'cloudflare' } }),
		);

		expect(response.status).toBe(500);
		expect(await response.json()).toMatchObject({
			success: false,
			message: 'An error occurred',
		});
	});
});

describe('AuthController.handleOAuthCallback Cloudflare auto-connect failure', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetPendingLinkUserId.mockResolvedValue(null);
		mockHandleOAuthCallback.mockResolvedValue({
			user: { id: 'user-1', email: 'user@example.com' },
			accessToken: 'session-jwt',
			redirectUrl: null,
			oauthTokens: {
				accessToken: 'cf-access-token',
				tokenType: 'Bearer',
				expiresIn: 3600,
			},
		});
	});

	it('preserves the login redirect and auth cookies', async () => {
		mockProvisionFromToken.mockRejectedValue(
			new Error('Cloudflare API down'),
		);

		const response = await AuthController.handleOAuthCallback(
			new Request(
				`${BASE_URL}/api/auth/callback/cloudflare?code=abc&state=xyz`,
			),
			testEnv,
			{} as ExecutionContext,
			makeContext({
				sessionId: null,
				pathParams: { provider: 'cloudflare' },
				queryParams: new URLSearchParams({ code: 'abc', state: 'xyz' }),
			}),
		);

		expect(response.status).toBe(302);
		const location = new URL(response.headers.get('Location')!);
		expect(location.searchParams.get('gateway')).toBeNull();
		// Identity login must still succeed: auth cookie + nonce cleanup are set.
		const setCookie = response.headers.get('Set-Cookie') ?? '';
		expect(setCookie.length).toBeGreaterThan(0);
	});

	it('does not flag the redirect when auto-connect succeeds', async () => {
		mockProvisionFromToken.mockResolvedValue({
			accountCount: 1,
			hasActiveGateway: true,
		});

		const response = await AuthController.handleOAuthCallback(
			new Request(
				`${BASE_URL}/api/auth/callback/cloudflare?code=abc&state=xyz`,
			),
			testEnv,
			{} as ExecutionContext,
			makeContext({
				sessionId: null,
				pathParams: { provider: 'cloudflare' },
				queryParams: new URLSearchParams({ code: 'abc', state: 'xyz' }),
			}),
		);

		expect(response.status).toBe(302);
		const location = new URL(response.headers.get('Location')!);
		expect(location.searchParams.get('gateway')).toBeNull();
	});
});

describe('AuthController.handleAccessCallback', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('JIT-provisions the user and redirects with a session cookie on a valid JWT', async () => {
		mockVerifyAccessJwt.mockResolvedValue({
			sub: 'access-sub-1',
			email: 'attendee@example.com',
		});
		mockHandleAccessLogin.mockResolvedValue({
			user: { id: 'user-1', email: 'attendee@example.com' },
			accessToken: 'session-jwt',
			sessionId: 'session-1',
			expiresAt: null,
		});

		const response = await AuthController.handleAccessCallback(
			new Request(`${BASE_URL}/auth/access/callback`),
			testEnv,
			{} as ExecutionContext,
			makeContext({ queryParams: new URLSearchParams() }),
		);

		expect(response.status).toBe(302);
		expect(response.headers.get('Location')).toBe(`${BASE_URL}/`);
		const setCookie = response.headers.get('Set-Cookie') ?? '';
		expect(setCookie).toContain('accessToken=');
		expect(mockHandleAccessLogin).toHaveBeenCalledWith(
			{ sub: 'access-sub-1', email: 'attendee@example.com' },
			expect.anything(),
		);
	});

	it('honors a validated redirect_url query param', async () => {
		mockVerifyAccessJwt.mockResolvedValue({
			sub: 'access-sub-1',
			email: 'attendee@example.com',
		});
		mockHandleAccessLogin.mockResolvedValue({
			user: { id: 'user-1', email: 'attendee@example.com' },
			accessToken: 'session-jwt',
			sessionId: 'session-1',
			expiresAt: null,
		});

		const response = await AuthController.handleAccessCallback(
			new Request(
				`${BASE_URL}/auth/access/callback?redirect_url=/chat/abc`,
			),
			testEnv,
			{} as ExecutionContext,
			makeContext({
				queryParams: new URLSearchParams({ redirect_url: '/chat/abc' }),
			}),
		);

		expect(response.headers.get('Location')).toBe('/chat/abc');
	});

	it('ignores an unsafe redirect_url and falls back to home', async () => {
		mockVerifyAccessJwt.mockResolvedValue({
			sub: 'access-sub-1',
			email: 'attendee@example.com',
		});
		mockHandleAccessLogin.mockResolvedValue({
			user: { id: 'user-1', email: 'attendee@example.com' },
			accessToken: 'session-jwt',
			sessionId: 'session-1',
			expiresAt: null,
		});

		const response = await AuthController.handleAccessCallback(
			new Request(
				`${BASE_URL}/auth/access/callback?redirect_url=https://evil.example.com`,
			),
			testEnv,
			{} as ExecutionContext,
			makeContext({
				queryParams: new URLSearchParams({
					redirect_url: 'https://evil.example.com',
				}),
			}),
		);

		expect(response.headers.get('Location')).toBe(`${BASE_URL}/`);
	});

	it('redirects to an error page when the JWT fails verification', async () => {
		mockVerifyAccessJwt.mockRejectedValue(
			new Error('signature verification failed'),
		);

		const response = await AuthController.handleAccessCallback(
			new Request(`${BASE_URL}/auth/access/callback`),
			testEnv,
			{} as ExecutionContext,
			makeContext({ queryParams: new URLSearchParams() }),
		);

		expect(response.status).toBe(302);
		expect(response.headers.get('Location')).toBe(
			`${BASE_URL}/?error=access_failed`,
		);
		expect(mockHandleAccessLogin).not.toHaveBeenCalled();
	});
});

describe('AuthController.getAuthProviders', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('reports access:true only when all three env vars are configured', async () => {
		const enabledResponse = await AuthController.getAuthProviders(
			new Request(`${BASE_URL}/api/auth/providers`),
			{
				...testEnv,
				ACCESS_ENABLED: 'true',
				ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
				ACCESS_AUD: 'test-aud',
			} as unknown as Env,
			{} as ExecutionContext,
			makeContext(),
		);
		const enabledBody = (await enabledResponse.json()) as {
			data: { providers: { access: boolean } };
		};
		expect(enabledBody.data.providers.access).toBe(true);

		const disabledResponse = await AuthController.getAuthProviders(
			new Request(`${BASE_URL}/api/auth/providers`),
			testEnv,
			{} as ExecutionContext,
			makeContext(),
		);
		const disabledBody = (await disabledResponse.json()) as {
			data: { providers: { access: boolean } };
		};
		expect(disabledBody.data.providers.access).toBe(false);
	});
});

describe('AuthController.logout', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('includes the Access hosted logout URL for an access-provider session', async () => {
		const response = await AuthController.logout(
			new Request(`${BASE_URL}/api/auth/logout`, { method: 'POST' }),
			{
				...testEnv,
				ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
			} as unknown as Env,
			{} as ExecutionContext,
			makeContext({
				user: {
					id: 'user-1',
					email: 'attendee@example.com',
					provider: 'access',
				},
			}),
		);

		const body = (await response.json()) as {
			data: { logoutUrl?: string };
		};
		expect(body.data.logoutUrl).toBe(
			'https://team.cloudflareaccess.com/cdn-cgi/access/logout',
		);
	});

	it('omits logoutUrl for a non-access session', async () => {
		const response = await AuthController.logout(
			new Request(`${BASE_URL}/api/auth/logout`, { method: 'POST' }),
			testEnv,
			{} as ExecutionContext,
			makeContext({
				user: {
					id: 'user-1',
					email: 'user@example.com',
					provider: 'github',
				},
			}),
		);

		const body = (await response.json()) as {
			data: { logoutUrl?: string };
		};
		expect(body.data.logoutUrl).toBeUndefined();
	});
});
