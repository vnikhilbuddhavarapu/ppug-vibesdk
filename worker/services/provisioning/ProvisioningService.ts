/**
 * ProvisioningService — on-demand Cloudflare resource provisioning for Think apps.
 *
 * Creates R2 buckets, D1 databases, KV namespaces, and Vectorize indexes via
 * the Cloudflare REST API using a dedicated, least-privilege API token, and
 * records ownership in the `provisioned_resources` table for per-user caps,
 * audit, and cleanup.
 */

import { eq, and } from 'drizzle-orm';
import { BaseService } from '../../database/services/BaseService';
import * as schema from '../../database/schema';
import { generateId } from '../../utils/idGenerator';
import {
	PROVISIONED_RESOURCE_TYPES,
	PROVISIONING_CAP_PER_TYPE,
	ProvisioningCapExceededError,
	ProvisioningApiError,
	type ProvisionResourceInput,
	type ProvisionedResourceRecord,
	type ProvisionedResourceType,
	type CloudflareApiResponse,
} from './types';

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';
const RESOURCE_NAME_SUFFIX: Record<ProvisionedResourceType, string> = {
	r2: 'r2',
	d1: 'd1',
	kv: 'kv',
	vectorize: 'vec',
};

function toRecord(
	row: typeof schema.provisionedResources.$inferSelect,
): ProvisionedResourceRecord {
	return {
		id: row.id,
		userId: row.userId,
		appId: row.appId,
		resourceType: row.resourceType as ProvisionedResourceType,
		resourceName: row.resourceName,
		resourceId: row.resourceId,
		bindingName: row.bindingName,
		status: row.status as 'active' | 'deleted',
		createdAt: row.createdAt ?? null,
	};
}

export class ProvisioningService extends BaseService {
	private get apiToken(): string {
		const token =
			this.env.CLOUDFLARE_PROVISIONING_API_TOKEN ||
			this.env.CLOUDFLARE_API_TOKEN;
		if (!token) {
			throw new Error(
				'CLOUDFLARE_PROVISIONING_API_TOKEN or CLOUDFLARE_API_TOKEN must be set for resource provisioning',
			);
		}
		return token;
	}

	private get accountId(): string {
		const accountId = this.env.CLOUDFLARE_ACCOUNT_ID;
		if (!accountId) {
			throw new Error(
				'CLOUDFLARE_ACCOUNT_ID must be set for resource provisioning',
			);
		}
		return accountId;
	}

	private cfHeaders(): HeadersInit {
		return {
			Authorization: `Bearer ${this.apiToken}`,
			'Content-Type': 'application/json',
		};
	}

	/** Deterministic, city-scoped, length-bounded resource name. */
	private async buildResourceName(
		userId: string,
		appId: string,
		resourceType: ProvisionedResourceType,
	): Promise<string> {
		const userHash = await this.shortHash(userId);
		const appHash = await this.shortHash(appId);
		return `ppug-mtl-${userHash}-${appHash}-${RESOURCE_NAME_SUFFIX[resourceType]}`;
	}

	private async shortHash(value: string): Promise<string> {
		const digest = await crypto.subtle.digest(
			'SHA-256',
			new TextEncoder().encode(value),
		);
		return Array.from(new Uint8Array(digest))
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('')
			.slice(0, 8);
	}

	/** Count of this user's currently-active resources of a given type. */
	private async countActive(
		userId: string,
		resourceType: ProvisionedResourceType,
	): Promise<number> {
		const rows = await this.database
			.select({ id: schema.provisionedResources.id })
			.from(schema.provisionedResources)
			.where(
				and(
					eq(schema.provisionedResources.userId, userId),
					eq(schema.provisionedResources.resourceType, resourceType),
					eq(schema.provisionedResources.status, 'active'),
				),
			);
		return rows.length;
	}

	async listProvisionedResources(
		userId: string,
		appId?: string,
	): Promise<ProvisionedResourceRecord[]> {
		const conditions = [
			eq(schema.provisionedResources.userId, userId),
			eq(schema.provisionedResources.status, 'active'),
		];
		if (appId) {
			conditions.push(eq(schema.provisionedResources.appId, appId));
		}
		const rows = await this.database
			.select()
			.from(schema.provisionedResources)
			.where(and(...conditions));
		return rows.map(toRecord);
	}

	async provisionResource(
		input: ProvisionResourceInput,
	): Promise<ProvisionedResourceRecord> {
		if (!PROVISIONED_RESOURCE_TYPES.includes(input.resourceType)) {
			throw new Error(`Unsupported resource type: ${input.resourceType}`);
		}

		const activeCount = await this.countActive(
			input.userId,
			input.resourceType,
		);
		if (activeCount >= PROVISIONING_CAP_PER_TYPE) {
			throw new ProvisioningCapExceededError(
				input.resourceType,
				PROVISIONING_CAP_PER_TYPE,
			);
		}

		const resourceName = await this.buildResourceName(
			input.userId,
			input.appId,
			input.resourceType,
		);
		const resourceId = await this.createCloudflareResource(
			input.resourceType,
			resourceName,
			input,
		);

		const now = new Date();
		const row: typeof schema.provisionedResources.$inferInsert = {
			id: generateId(),
			userId: input.userId,
			appId: input.appId,
			resourceType: input.resourceType,
			resourceName,
			resourceId,
			bindingName: input.bindingName,
			status: 'active',
			createdAt: now,
			updatedAt: now,
		};
		await this.database.insert(schema.provisionedResources).values(row);

		this.logger.info('Provisioned resource', {
			userId: input.userId,
			appId: input.appId,
			resourceType: input.resourceType,
			resourceName,
		});

		return toRecord(row as typeof schema.provisionedResources.$inferSelect);
	}

	async deleteResource(
		userId: string,
		resourceRecordId: string,
	): Promise<void> {
		const [row] = await this.database
			.select()
			.from(schema.provisionedResources)
			.where(
				and(
					eq(schema.provisionedResources.id, resourceRecordId),
					eq(schema.provisionedResources.userId, userId),
				),
			);
		if (!row) {
			throw new Error('Provisioned resource not found');
		}

		await this.deleteCloudflareResource(
			row.resourceType as ProvisionedResourceType,
			row.resourceId,
		);

		await this.database
			.update(schema.provisionedResources)
			.set({ status: 'deleted', updatedAt: new Date() })
			.where(eq(schema.provisionedResources.id, resourceRecordId));

		this.logger.info('Deleted provisioned resource', {
			userId,
			resourceRecordId,
			resourceType: row.resourceType,
		});
	}

	private async createCloudflareResource(
		resourceType: ProvisionedResourceType,
		resourceName: string,
		input: ProvisionResourceInput,
	): Promise<string> {
		switch (resourceType) {
			case 'r2':
				return this.createR2Bucket(resourceName);
			case 'kv':
				return this.createKvNamespace(resourceName);
			case 'd1':
				return this.createD1Database(resourceName);
			case 'vectorize':
				return this.createVectorizeIndex(
					resourceName,
					input.dimensions ?? 768,
					input.metric ?? 'cosine',
				);
		}
	}

	private async deleteCloudflareResource(
		resourceType: ProvisionedResourceType,
		resourceId: string,
	): Promise<void> {
		const urls: Record<ProvisionedResourceType, string> = {
			r2: `${CF_API_BASE}/accounts/${this.accountId}/r2/buckets/${resourceId}`,
			kv: `${CF_API_BASE}/accounts/${this.accountId}/storage/kv/namespaces/${resourceId}`,
			d1: `${CF_API_BASE}/accounts/${this.accountId}/d1/database/${resourceId}`,
			vectorize: `${CF_API_BASE}/accounts/${this.accountId}/vectorize/v2/indexes/${resourceId}`,
		};
		const response = await fetch(urls[resourceType], {
			method: 'DELETE',
			headers: this.cfHeaders(),
		});
		if (!response.ok) {
			const details = await response.text();
			throw new ProvisioningApiError(resourceType, response.status, details);
		}
	}

	private async createR2Bucket(name: string): Promise<string> {
		const response = await fetch(
			`${CF_API_BASE}/accounts/${this.accountId}/r2/buckets`,
			{
				method: 'POST',
				headers: this.cfHeaders(),
				body: JSON.stringify({ name }),
			},
		);
		const result = await this.parseCfResponse<{ name: string }>(
			response,
			'r2',
		);
		return result.name;
	}

	private async createKvNamespace(title: string): Promise<string> {
		const response = await fetch(
			`${CF_API_BASE}/accounts/${this.accountId}/storage/kv/namespaces`,
			{
				method: 'POST',
				headers: this.cfHeaders(),
				body: JSON.stringify({ title }),
			},
		);
		const result = await this.parseCfResponse<{ id: string }>(response, 'kv');
		return result.id;
	}

	private async createD1Database(name: string): Promise<string> {
		const response = await fetch(
			`${CF_API_BASE}/accounts/${this.accountId}/d1/database`,
			{
				method: 'POST',
				headers: this.cfHeaders(),
				body: JSON.stringify({ name }),
			},
		);
		const result = await this.parseCfResponse<{ uuid: string }>(
			response,
			'd1',
		);
		return result.uuid;
	}

	private async createVectorizeIndex(
		name: string,
		dimensions: number,
		metric: 'cosine' | 'euclidean' | 'dot-product',
	): Promise<string> {
		const response = await fetch(
			`${CF_API_BASE}/accounts/${this.accountId}/vectorize/v2/indexes`,
			{
				method: 'POST',
				headers: this.cfHeaders(),
				body: JSON.stringify({
					name,
					config: { dimensions, metric },
				}),
			},
		);
		const result = await this.parseCfResponse<{ name: string }>(
			response,
			'vectorize',
		);
		return result.name;
	}

	private async parseCfResponse<T>(
		response: Response,
		resourceType: ProvisionedResourceType,
	): Promise<T> {
		if (!response.ok) {
			const details = await response.text();
			throw new ProvisioningApiError(resourceType, response.status, details);
		}
		const body: CloudflareApiResponse<T> = await response.json();
		if (!body.success || !body.result) {
			throw new ProvisioningApiError(
				resourceType,
				response.status,
				JSON.stringify(body.errors),
			);
		}
		return body.result;
	}
}
