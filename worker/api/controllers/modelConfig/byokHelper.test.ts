import { describe, it, expect } from 'vitest';
import {
	getPlatformEnabledProviders,
	getPlatformAvailableModels,
	validateModelAccessForEnvironment,
} from './byokHelper';
import { AIModels } from '../../../agents/inferutils/config.types';

function makeEnv(overrides: Partial<Env> = {}): Env {
	return { ...overrides } as Env;
}

describe('getPlatformEnabledProviders', () => {
	it('always includes workers-ai even with no provider API keys configured', () => {
		expect(getPlatformEnabledProviders(makeEnv())).toContain('workers-ai');
	});

	it('includes workers-ai even when PLATFORM_MODEL_PROVIDERS is explicitly set', () => {
		const providers = getPlatformEnabledProviders(
			makeEnv({ PLATFORM_MODEL_PROVIDERS: 'anthropic,openai' }),
		);
		expect(providers).toContain('workers-ai');
		expect(providers).toContain('anthropic');
		expect(providers).toContain('openai');
	});
});

describe('getPlatformAvailableModels', () => {
	it('includes the think agent workers-ai models', () => {
		const models = getPlatformAvailableModels(makeEnv());
		expect(models).toContain(AIModels.GLM_5_3);
		expect(models).toContain(AIModels.DEEPSEEK_V4_FLASH);
	});
});

describe('validateModelAccessForEnvironment', () => {
	it('allows a workers-ai model with no BYOK key and no provider API key set', () => {
		expect(
			validateModelAccessForEnvironment(AIModels.GLM_5_3, makeEnv(), []),
		).toBe(true);
	});
});
