/**
 * Typed builder for the `cf-aig-metadata` header sent on every AI Gateway
 * request, so cost/usage in the gateway dashboard can be grouped per
 * attendee (userId/userEmail) and per surface (think / phasic / agentic /
 * user-app-proxy). Centralizes what were previously three separate ad-hoc
 * `JSON.stringify` call sites.
 */

export interface AigMetadataInput {
	userId: string;
	userEmail?: string;
	appId?: string;
	agentId?: string;
	/** Which part of the platform issued the request. */
	surface: 'think' | 'phasic' | 'agentic' | 'user-app-proxy';
	actionKey?: string;
	schemaName?: string;
}

export function buildAigMetadata(
	input: AigMetadataInput,
): Record<string, string> {
	const metadata: Record<string, string> = {
		userId: input.userId,
		surface: input.surface,
	};
	if (input.userEmail) metadata.userEmail = input.userEmail;
	if (input.appId) metadata.appId = input.appId;
	if (input.agentId) metadata.agentId = input.agentId;
	if (input.actionKey) metadata.actionKey = input.actionKey;
	if (input.schemaName) metadata.schemaName = input.schemaName;
	return metadata;
}

export function buildAigMetadataHeader(input: AigMetadataInput): string {
	return JSON.stringify(buildAigMetadata(input));
}
