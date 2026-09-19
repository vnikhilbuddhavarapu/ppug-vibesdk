import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mocks } = vi.hoisted(() => ({
	mocks: {
		provisionResource: vi.fn(),
		listProvisionedResources: vi.fn(),
		runD1Migration: vi.fn(),
	},
}));

vi.mock('../../services/provisioning/ProvisioningService', () => ({
	ProvisioningService: class {
		provisionResource = mocks.provisionResource;
		listProvisionedResources = mocks.listProvisionedResources;
		runD1Migration = mocks.runD1Migration;
	},
}));

const {
	createProvisionResourceTool,
	createListProvisionedResourcesTool,
	createRunD1MigrationTool,
} = await import('./provisioning-tools');

const opts = { env: {} as Env, userId: 'user-1', appId: 'app-1' };

function execute<T>(tool: { execute?: (...a: never[]) => unknown }, args: T) {
	return tool.execute!(args as never, {} as never);
}

describe('provisioning-tools', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('provision_resource', () => {
		it('provisions a resource and returns it', async () => {
			mocks.provisionResource.mockResolvedValue({
				id: 'res-1',
				resourceType: 'kv',
				bindingName: 'KV',
			});
			const tool = createProvisionResourceTool(opts);

			const result = JSON.parse(
				(await execute(tool, {
					resource_type: 'kv',
					binding_name: 'KV',
				})) as string,
			);

			expect(result.ok).toBe(true);
			expect(result.resource.bindingName).toBe('KV');
			expect(mocks.provisionResource).toHaveBeenCalledWith({
				userId: 'user-1',
				appId: 'app-1',
				resourceType: 'kv',
				bindingName: 'KV',
				dimensions: undefined,
				metric: undefined,
			});
		});

		it('surfaces a cap-exceeded error as a JSON error field, not a thrown exception', async () => {
			mocks.provisionResource.mockRejectedValue(new Error('cap reached'));
			const tool = createProvisionResourceTool(opts);

			const result = JSON.parse(
				(await execute(tool, {
					resource_type: 'r2',
					binding_name: 'BUCKET',
				})) as string,
			);

			expect(result.error).toBe('cap reached');
		});
	});

	describe('list_provisioned_resources', () => {
		it('returns app resources plus per-type usage across all the user\'s apps', async () => {
			mocks.listProvisionedResources.mockImplementation(
				async (_userId: string, appId?: string) =>
					appId
						? [{ resourceType: 'kv', bindingName: 'KV' }]
						: [
								{ resourceType: 'kv', bindingName: 'KV' },
								{ resourceType: 'kv', bindingName: 'KV2' },
								{ resourceType: 'r2', bindingName: 'BUCKET' },
							],
			);
			const tool = createListProvisionedResourcesTool(opts);

			const result = JSON.parse((await execute(tool, {})) as string);

			expect(result.resources).toHaveLength(1);
			expect(result.used_by_type).toMatchObject({
				kv: 2,
				r2: 1,
				d1: 0,
				vectorize: 0,
			});
		});
	});

	describe('run_d1_migration', () => {
		it('runs the migration and returns ok', async () => {
			mocks.runD1Migration.mockResolvedValue(undefined);
			const tool = createRunD1MigrationTool(opts);

			const result = JSON.parse(
				(await execute(tool, {
					binding_name: 'DB',
					sql: 'CREATE TABLE notes (id TEXT PRIMARY KEY)',
				})) as string,
			);

			expect(result.ok).toBe(true);
			expect(mocks.runD1Migration).toHaveBeenCalledWith(
				'user-1',
				'app-1',
				'DB',
				'CREATE TABLE notes (id TEXT PRIMARY KEY)',
			);
		});

		it('surfaces a rejected migration as a JSON error field', async () => {
			mocks.runD1Migration.mockRejectedValue(
				new Error('Migration statement rejected'),
			);
			const tool = createRunD1MigrationTool(opts);

			const result = JSON.parse(
				(await execute(tool, {
					binding_name: 'DB',
					sql: 'DROP TABLE notes',
				})) as string,
			);

			expect(result.error).toContain('Migration statement rejected');
		});
	});
});
