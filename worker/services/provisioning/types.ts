/**
 * Types for on-demand Cloudflare resource provisioning (R2/D1/KV/Vectorize).
 */

export type ProvisionedResourceType = 'r2' | 'd1' | 'kv' | 'vectorize';

export const PROVISIONED_RESOURCE_TYPES: readonly ProvisionedResourceType[] = [
	'r2',
	'd1',
	'kv',
	'vectorize',
];

/** Per-user, per-resource-type provisioning cap for the event. */
export const PROVISIONING_CAP_PER_TYPE = 5;

export interface ProvisionResourceInput {
	userId: string;
	appId: string;
	resourceType: ProvisionedResourceType;
	/** Conventional binding name the deployer injects into the worker, e.g. BUCKET/DB/KV/VECTORIZE. */
	bindingName: string;
	/** Vectorize-only: embedding dimensions. Defaults to 768. */
	dimensions?: number;
	/** Vectorize-only: distance metric. Defaults to 'cosine'. */
	metric?: 'cosine' | 'euclidean' | 'dot-product';
}

export interface ProvisionedResourceRecord {
	id: string;
	userId: string;
	appId: string;
	resourceType: ProvisionedResourceType;
	resourceName: string;
	resourceId: string;
	bindingName: string;
	status: 'active' | 'deleted';
	createdAt: Date | null;
}

/** Thrown when a user has hit their per-resource-type provisioning cap. */
export class ProvisioningCapExceededError extends Error {
	constructor(
		public readonly resourceType: ProvisionedResourceType,
		public readonly cap: number,
	) {
		super(
			`Provisioning cap reached: you already have ${cap} ${resourceType} resources. Delete one before provisioning another.`,
		);
		this.name = 'ProvisioningCapExceededError';
	}
}

/** Thrown when the Cloudflare API rejects a provisioning request. */
export class ProvisioningApiError extends Error {
	constructor(
		public readonly resourceType: ProvisionedResourceType,
		public readonly status: number,
		details: string,
	) {
		super(`Failed to provision ${resourceType}: HTTP ${status}: ${details}`);
		this.name = 'ProvisioningApiError';
	}
}

/** Generic Cloudflare API v4 response envelope. */
export interface CloudflareApiResponse<T> {
	success: boolean;
	errors: Array<{ code: number; message: string }>;
	messages: unknown[];
	result: T | null;
}
