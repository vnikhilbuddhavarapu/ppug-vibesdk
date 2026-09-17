import { describe, it, expect } from 'vitest';
import { buildAigMetadata, buildAigMetadataHeader } from './metadata';

describe('buildAigMetadata', () => {
	it('includes required fields and omits absent optional fields', () => {
		const metadata = buildAigMetadata({
			userId: 'user-1',
			surface: 'think',
		});
		expect(metadata).toEqual({ userId: 'user-1', surface: 'think' });
	});

	it('includes optional fields only when provided', () => {
		const metadata = buildAigMetadata({
			userId: 'user-1',
			userEmail: 'attendee@example.com',
			appId: 'app-1',
			agentId: 'agent-1',
			surface: 'user-app-proxy',
			actionKey: 'phaseImplementation',
			schemaName: 'blueprint',
		});
		expect(metadata).toEqual({
			userId: 'user-1',
			userEmail: 'attendee@example.com',
			appId: 'app-1',
			agentId: 'agent-1',
			surface: 'user-app-proxy',
			actionKey: 'phaseImplementation',
			schemaName: 'blueprint',
		});
	});
});

describe('buildAigMetadataHeader', () => {
	it('serializes to a JSON string suitable for the cf-aig-metadata header', () => {
		const header = buildAigMetadataHeader({
			userId: 'user-1',
			surface: 'think',
		});
		expect(JSON.parse(header)).toEqual({
			userId: 'user-1',
			surface: 'think',
		});
	});
});
