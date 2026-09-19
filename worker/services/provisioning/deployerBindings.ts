/**
 * Maps provisioned Cloudflare resources to the deployer's `WorkerBinding`
 * shape, so `deployThinkBundleToPlatform`/`deployThinkBundleToUserAccount`
 * can merge them into a Think app's upload metadata.
 */
import type { WorkerBinding } from '../deployer/types';
import type { ProvisionedResourceRecord } from './types';

export function toWorkerBinding(
	resource: ProvisionedResourceRecord,
): WorkerBinding {
	switch (resource.resourceType) {
		case 'r2':
			return {
				name: resource.bindingName,
				type: 'r2_bucket',
				bucket_name: resource.resourceId,
			};
		case 'kv':
			return {
				name: resource.bindingName,
				type: 'kv_namespace',
				namespace_id: resource.resourceId,
			};
		case 'd1':
			return {
				name: resource.bindingName,
				type: 'd1',
				database_id: resource.resourceId,
			};
		case 'vectorize':
			return {
				name: resource.bindingName,
				type: 'vectorize',
				index_name: resource.resourceId,
			};
	}
}

/**
 * Converts provisioned resources to deploy-ready bindings, dropping any
 * whose binding name collides with a reserved/base binding name (e.g. the
 * app's own Durable Object or ASSETS binding) so a provisioned resource can
 * never shadow platform-managed bindings.
 */
export function toWorkerBindings(
	resources: ProvisionedResourceRecord[],
	reservedNames: ReadonlySet<string>,
): WorkerBinding[] {
	return resources
		.filter((resource) => !reservedNames.has(resource.bindingName))
		.map(toWorkerBinding);
}
