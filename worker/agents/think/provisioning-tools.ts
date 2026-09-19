/**
 * Think tools for on-demand Cloudflare resource provisioning: `provision_resource`,
 * `list_provisioned_resources`, `run_d1_migration`. Each talks directly to
 * `ProvisioningService` from inside the ThinkAgent DO — no round-trip through
 * the host `ThinkCodingBehavior` is needed since provisioning only touches D1
 * (via the platform's own `env.DB` binding) and the Cloudflare REST API.
 */
import { tool, type Tool } from 'ai';
import { z } from 'zod';
import { ProvisioningService } from '../../services/provisioning/ProvisioningService';
import { PROVISIONED_RESOURCE_TYPES } from '../../services/provisioning/types';

interface ProvisioningToolOpts {
	env: Env;
	userId: string;
	appId: string;
}

const RESOURCE_TYPE_ENUM = z.enum(
	PROVISIONED_RESOURCE_TYPES as [string, ...string[]],
);

const PROVISION_DESCRIPTION = [
	'Provision a Cloudflare resource (R2 bucket, D1 database, KV namespace, or Vectorize index) for this app.',
	'',
	'Choose a short, conventional binding_name matching what the generated code should reference — e.g. BUCKET for r2, DB for d1, KV for kv, VECTORIZE for vectorize. The resource is bound into the deployed worker under that name.',
	'',
	'Each attendee has a cap of 5 resources per type across all their apps. If the cap is hit, delete an unused resource first or reuse an existing one via list_provisioned_resources.',
].join('\n');

export function createProvisionResourceTool(opts: ProvisioningToolOpts): Tool {
	const { env, userId, appId } = opts;
	return tool({
		description: PROVISION_DESCRIPTION,
		inputSchema: z.object({
			resource_type: RESOURCE_TYPE_ENUM.describe(
				'Which Cloudflare resource to provision.',
			),
			binding_name: z
				.string()
				.min(1)
				.describe(
					'Conventional binding name the deployed worker will reference, e.g. BUCKET/DB/KV/VECTORIZE.',
				),
			dimensions: z
				.number()
				.int()
				.positive()
				.optional()
				.describe('Vectorize only: embedding dimensions. Defaults to 768.'),
			metric: z
				.enum(['cosine', 'euclidean', 'dot-product'])
				.optional()
				.describe('Vectorize only: distance metric. Defaults to cosine.'),
		}),
		execute: async (args: {
			resource_type: string;
			binding_name: string;
			dimensions?: number;
			metric?: 'cosine' | 'euclidean' | 'dot-product';
		}) => {
			try {
				const service = new ProvisioningService(env);
				const record = await service.provisionResource({
					userId,
					appId,
					resourceType:
						args.resource_type as (typeof PROVISIONED_RESOURCE_TYPES)[number],
					bindingName: args.binding_name,
					dimensions: args.dimensions,
					metric: args.metric,
				});
				return JSON.stringify({ ok: true, resource: record });
			} catch (error) {
				return JSON.stringify({
					error: error instanceof Error ? error.message : String(error),
				});
			}
		},
	});
}

const LIST_DESCRIPTION = [
	"List Cloudflare resources already provisioned for this app, plus this attendee's remaining cap per resource type.",
	'',
	'Call this before provisioning to check what already exists (avoid duplicate resources) or how close the cap is.',
].join('\n');

export function createListProvisionedResourcesTool(
	opts: ProvisioningToolOpts,
): Tool {
	const { env, userId, appId } = opts;
	return tool({
		description: LIST_DESCRIPTION,
		inputSchema: z.object({}),
		execute: async () => {
			try {
				const service = new ProvisioningService(env);
				const [appResources, allUserResources] = await Promise.all([
					service.listProvisionedResources(userId, appId),
					service.listProvisionedResources(userId),
				]);
				const usedByType: Record<string, number> = {};
				for (const type of PROVISIONED_RESOURCE_TYPES) {
					usedByType[type] = allUserResources.filter(
						(r) => r.resourceType === type,
					).length;
				}
				return JSON.stringify({
					ok: true,
					resources: appResources,
					used_by_type: usedByType,
				});
			} catch (error) {
				return JSON.stringify({
					error: error instanceof Error ? error.message : String(error),
				});
			}
		},
	});
}

const MIGRATION_DESCRIPTION = [
	'Run an additive-only schema migration against a D1 database provisioned for this app.',
	'',
	'Only CREATE TABLE, CREATE INDEX, and ALTER TABLE ... ADD COLUMN statements are allowed — anything destructive (DROP, DELETE, UPDATE, TRUNCATE, raw DML) is rejected before it runs. Migrations can only extend a schema, never remove data or structure.',
].join('\n');

export function createRunD1MigrationTool(opts: ProvisioningToolOpts): Tool {
	const { env, userId, appId } = opts;
	return tool({
		description: MIGRATION_DESCRIPTION,
		inputSchema: z.object({
			binding_name: z
				.string()
				.min(1)
				.describe('The binding_name the D1 database was provisioned under.'),
			sql: z
				.string()
				.min(1)
				.describe(
					'One or more additive schema statements, separated by semicolons.',
				),
		}),
		execute: async (args: { binding_name: string; sql: string }) => {
			try {
				const service = new ProvisioningService(env);
				await service.runD1Migration(
					userId,
					appId,
					args.binding_name,
					args.sql,
				);
				return JSON.stringify({ ok: true });
			} catch (error) {
				return JSON.stringify({
					error: error instanceof Error ? error.message : String(error),
				});
			}
		},
	});
}
