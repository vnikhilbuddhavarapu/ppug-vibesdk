import { describe, it, expect } from 'vitest';
import { AIModels, AI_MODEL_CONFIG } from './config.types';
import { AGENT_CONFIG, AGENT_CONSTRAINTS } from './config';

const EXPECTED_WORKERS_AI_MODELS = [
	AIModels.DEEPSEEK_V4_PRO,
	AIModels.DEEPSEEK_V4_FLASH,
	AIModels.KIMI_K2_6,
	AIModels.KIMI_K2_7_CODE,
	AIModels.GLM_5_2,
	AIModels.GLM_5_3,
	AIModels.GLM_5_3_FLASH,
] as const;

describe('workers-ai model registration', () => {
	it('registers exactly the 7 event models with provider workers-ai', () => {
		for (const id of EXPECTED_WORKERS_AI_MODELS) {
			expect(id.startsWith('workers-ai/')).toBe(true);
			expect(AI_MODEL_CONFIG[id]).toBeDefined();
			expect(AI_MODEL_CONFIG[id].provider).toBe('workers-ai');
		}
	});

	it('registers no more than the 7 event workers-ai models', () => {
		const workersAiIds = Object.keys(AI_MODEL_CONFIG).filter((id) =>
			id.startsWith('workers-ai/'),
		);
		expect(workersAiIds.sort()).toEqual(
			[...EXPECTED_WORKERS_AI_MODELS].sort(),
		);
	});
});

describe("'think' agent role", () => {
	it('defaults to GLM 5.3', () => {
		expect(AGENT_CONFIG.think.name).toBe(AIModels.GLM_5_3);
	});

	it('falls back to DeepSeek V4 Flash', () => {
		expect(AGENT_CONFIG.think.fallbackModel).toBe(
			AIModels.DEEPSEEK_V4_FLASH,
		);
	});

	it('is constrained to exactly the 7 event models', () => {
		const constraint = AGENT_CONSTRAINTS.get('think');
		expect(constraint?.enabled).toBe(true);
		expect(Array.from(constraint?.allowedModels ?? []).sort()).toEqual(
			[...EXPECTED_WORKERS_AI_MODELS].sort(),
		);
	});
});
