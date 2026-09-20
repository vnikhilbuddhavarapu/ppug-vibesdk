import { beforeEach, describe, expect, it, vi } from 'vitest';

const deployWorker = vi.fn();
const createAssetUploadSession = vi.fn().mockResolvedValue({ jwt: 'upload-jwt', buckets: [] });

vi.mock('./api/cloudflare-api', () => ({
	CloudflareAPI: vi.fn().mockImplementation(() => ({
		deployWorker,
		createAssetUploadSession,
	})),
}));

const { WorkerDeployer } = await import('./deployer');

describe('WorkerDeployer', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('deploySimple converts vars into secret_text bindings instead of a top-level vars field', async () => {
		const deployer = new WorkerDeployer('account', 'token');
		await deployer.deploySimple(
			'my-app',
			'export default { fetch() {} }',
			'2025-01-01',
			[{ name: 'VIBE_APP', type: 'durable_object_namespace', class_name: 'App' }],
			{ CF_AI_BASE_URL: 'https://gateway.example.com/api/proxy/openai', CF_AI_API_KEY: 'token' },
		);

		expect(deployWorker).toHaveBeenCalledTimes(1);
		const metadata = deployWorker.mock.calls[0][1];
		expect(metadata.vars).toBeUndefined();
		expect(metadata.bindings).toContainEqual({
			name: 'CF_AI_BASE_URL',
			type: 'secret_text',
			text: 'https://gateway.example.com/api/proxy/openai',
		});
		expect(metadata.bindings).toContainEqual({
			name: 'CF_AI_API_KEY',
			type: 'secret_text',
			text: 'token',
		});
		expect(metadata.bindings).toContainEqual({
			name: 'VIBE_APP',
			type: 'durable_object_namespace',
			class_name: 'App',
		});
	});

	it('deployWithAssets converts vars into secret_text bindings instead of a top-level vars field', async () => {
		const deployer = new WorkerDeployer('account', 'token');
		await deployer.deployWithAssets(
			'my-app',
			'export default { fetch() {} }',
			'2025-01-01',
			{},
			new Map(),
			[{ name: 'ASSETS', type: 'assets' }],
			{ CF_AI_BASE_URL: 'https://gateway.example.com/api/proxy/openai', CF_AI_API_KEY: 'token' },
		);

		expect(deployWorker).toHaveBeenCalledTimes(1);
		const metadata = deployWorker.mock.calls[0][1];
		expect(metadata.vars).toBeUndefined();
		expect(metadata.bindings).toContainEqual({
			name: 'CF_AI_BASE_URL',
			type: 'secret_text',
			text: 'https://gateway.example.com/api/proxy/openai',
		});
		expect(metadata.bindings).toContainEqual({
			name: 'CF_AI_API_KEY',
			type: 'secret_text',
			text: 'token',
		});
	});

	it('omits vars-derived bindings entirely when no vars are provided', async () => {
		const deployer = new WorkerDeployer('account', 'token');
		await deployer.deploySimple(
			'my-app',
			'export default { fetch() {} }',
			'2025-01-01',
			[{ name: 'VIBE_APP', type: 'durable_object_namespace', class_name: 'App' }],
		);

		const metadata = deployWorker.mock.calls[0][1];
		expect(metadata.bindings).toEqual([
			{ name: 'VIBE_APP', type: 'durable_object_namespace', class_name: 'App' },
		]);
	});
});
