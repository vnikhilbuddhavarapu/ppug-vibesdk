import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	ProvisioningCapExceededError,
	ProvisioningApiError,
	PROVISIONING_CAP_PER_TYPE,
} from './types';

const { state } = vi.hoisted(() => ({
	state: {
		selectResult: [] as Record<string, unknown>[],
		inserted: [] as Record<string, unknown>[],
		updated: [] as { set: Record<string, unknown> }[],
	},
}));

vi.mock('../../database/database', () => ({
	createDatabaseService: () => ({
		db: {
			select: () => ({
				from: () => ({
					where: () => state.selectResult,
				}),
			}),
			insert: () => ({
				values: async (row: Record<string, unknown>) => {
					state.inserted.push(row);
				},
			}),
			update: () => ({
				set: (set: Record<string, unknown>) => ({
					where: async () => {
						state.updated.push({ set });
					},
				}),
			}),
		},
	}),
}));

const { ProvisioningService } = await import('./ProvisioningService');

const testEnv = {
	CLOUDFLARE_ACCOUNT_ID: 'account-1',
	CLOUDFLARE_PROVISIONING_API_TOKEN: 'provisioning-token',
	DB: {},
} as unknown as Env;

function mockFetchOnce(status: number, body: unknown) {
	global.fetch = vi.fn().mockResolvedValueOnce({
		ok: status >= 200 && status < 300,
		status,
		json: async () => body,
		text: async () => JSON.stringify(body),
	}) as unknown as typeof fetch;
}

describe('ProvisioningService', () => {
	beforeEach(() => {
		state.selectResult = [];
		state.inserted = [];
		state.updated = [];
		vi.restoreAllMocks();
	});

	it('provisions an R2 bucket and records ownership', async () => {
		mockFetchOnce(200, { success: true, errors: [], result: { name: 'ignored-by-cf' } });
		const service = new ProvisioningService(testEnv);

		const record = await service.provisionResource({
			userId: 'user-1',
			appId: 'app-1',
			resourceType: 'r2',
			bindingName: 'BUCKET',
		});

		expect(record.resourceType).toBe('r2');
		expect(record.bindingName).toBe('BUCKET');
		expect(record.resourceName).toMatch(/^ppug-mtl-[0-9a-f]{8}-[0-9a-f]{8}-r2$/);
		expect(state.inserted).toHaveLength(1);
	});

	it('rejects provisioning once the per-type cap is reached', async () => {
		state.selectResult = Array.from({ length: PROVISIONING_CAP_PER_TYPE }, (_, i) => ({
			id: `res-${i}`,
		}));
		const service = new ProvisioningService(testEnv);

		await expect(
			service.provisionResource({
				userId: 'user-1',
				appId: 'app-1',
				resourceType: 'kv',
				bindingName: 'KV',
			}),
		).rejects.toThrow(ProvisioningCapExceededError);
		expect(state.inserted).toHaveLength(0);
	});

	it('surfaces a Cloudflare API failure without recording a resource', async () => {
		mockFetchOnce(403, { success: false, errors: [{ code: 1000, message: 'nope' }], result: null });
		const service = new ProvisioningService(testEnv);

		await expect(
			service.provisionResource({
				userId: 'user-1',
				appId: 'app-1',
				resourceType: 'd1',
				bindingName: 'DB',
			}),
		).rejects.toThrow(ProvisioningApiError);
		expect(state.inserted).toHaveLength(0);
	});

	it('lists active provisioned resources for a user', async () => {
		state.selectResult = [
			{
				id: 'res-1',
				userId: 'user-1',
				appId: 'app-1',
				resourceType: 'kv',
				resourceName: 'ppug-mtl-aaaaaaaa-bbbbbbbb-kv',
				resourceId: 'kv-id',
				bindingName: 'KV',
				status: 'active',
				createdAt: new Date(),
			},
		];
		const service = new ProvisioningService(testEnv);

		const resources = await service.listProvisionedResources('user-1');

		expect(resources).toHaveLength(1);
		expect(resources[0].bindingName).toBe('KV');
	});

	it('deletes a provisioned resource via the Cloudflare API and marks it deleted', async () => {
		state.selectResult = [
			{
				id: 'res-1',
				userId: 'user-1',
				appId: 'app-1',
				resourceType: 'kv',
				resourceName: 'ppug-mtl-aaaaaaaa-bbbbbbbb-kv',
				resourceId: 'kv-id',
				bindingName: 'KV',
				status: 'active',
				createdAt: new Date(),
			},
		];
		mockFetchOnce(200, {});
		const service = new ProvisioningService(testEnv);

		await service.deleteResource('user-1', 'res-1');

		expect(state.updated).toHaveLength(1);
		expect(state.updated[0].set).toMatchObject({ status: 'deleted' });
	});

	it('throws when deleting a resource that does not belong to the user', async () => {
		state.selectResult = [];
		const service = new ProvisioningService(testEnv);

		await expect(service.deleteResource('user-1', 'missing')).rejects.toThrow(
			'Provisioned resource not found',
		);
	});
});
