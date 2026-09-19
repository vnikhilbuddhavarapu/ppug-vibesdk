import { describe, it, expect } from 'vitest';
import { toWorkerBinding, toWorkerBindings } from './deployerBindings';
import type { ProvisionedResourceRecord } from './types';

function makeResource(
	overrides: Partial<ProvisionedResourceRecord> = {},
): ProvisionedResourceRecord {
	return {
		id: 'res-1',
		userId: 'user-1',
		appId: 'app-1',
		resourceType: 'kv',
		resourceName: 'ppug-mtl-aaaaaaaa-bbbbbbbb-kv',
		resourceId: 'kv-id',
		bindingName: 'KV',
		status: 'active',
		createdAt: null,
		...overrides,
	};
}

describe('toWorkerBinding', () => {
	it('maps r2 resources to an r2_bucket binding', () => {
		expect(
			toWorkerBinding(
				makeResource({ resourceType: 'r2', resourceId: 'my-bucket', bindingName: 'BUCKET' }),
			),
		).toEqual({ name: 'BUCKET', type: 'r2_bucket', bucket_name: 'my-bucket' });
	});

	it('maps kv resources to a kv_namespace binding', () => {
		expect(
			toWorkerBinding(makeResource({ resourceType: 'kv', resourceId: 'kv-id', bindingName: 'KV' })),
		).toEqual({ name: 'KV', type: 'kv_namespace', namespace_id: 'kv-id' });
	});

	it('maps d1 resources to a d1 binding', () => {
		expect(
			toWorkerBinding(makeResource({ resourceType: 'd1', resourceId: 'db-uuid', bindingName: 'DB' })),
		).toEqual({ name: 'DB', type: 'd1', database_id: 'db-uuid' });
	});

	it('maps vectorize resources to a vectorize binding', () => {
		expect(
			toWorkerBinding(
				makeResource({ resourceType: 'vectorize', resourceId: 'my-index', bindingName: 'VECTORIZE' }),
			),
		).toEqual({ name: 'VECTORIZE', type: 'vectorize', index_name: 'my-index' });
	});
});

describe('toWorkerBindings', () => {
	it('converts every resource not shadowing a reserved binding name', () => {
		const resources = [
			makeResource({ bindingName: 'KV' }),
			makeResource({ bindingName: 'BUCKET', resourceType: 'r2', resourceId: 'my-bucket' }),
		];

		const bindings = toWorkerBindings(resources, new Set(['VIBE_APP', 'ASSETS']));

		expect(bindings).toHaveLength(2);
		expect(bindings.map((b) => b.name)).toEqual(['KV', 'BUCKET']);
	});

	it('drops resources whose binding name collides with a reserved name', () => {
		const resources = [makeResource({ bindingName: 'VIBE_APP' })];

		const bindings = toWorkerBindings(resources, new Set(['VIBE_APP', 'ASSETS']));

		expect(bindings).toHaveLength(0);
	});
});
