/**
 * Type definitions for ModelConfig Controller responses
 */

import type {
	UserModelConfigWithMetadata,
	ModelTestResult,
} from '../../../database/types';
import type {
	AgentActionKey,
	ModelConfig,
	AIModels,
} from '../../../agents/inferutils/config.types';

export interface UserProviderStatus {
	provider: string;
	hasValidKey: boolean;
	keyPreview?: string;
}

export interface ModelsByProvider {
	[provider: string]: AIModels[];
}
import { UserModelConfig } from '../../../database/schema';

/**
 * Response data for getModelConfigs
 */
export interface ModelConfigsData {
	configs: Record<AgentActionKey, UserModelConfigWithMetadata>;
	defaults: Record<AgentActionKey, ModelConfig>;
	message: string;
}

/**
 * Response data for getModelConfig
 */
export interface ModelConfigData {
	config: UserModelConfigWithMetadata;
	defaultConfig: ModelConfig;
	message: string;
}

/**
 * Response data for updateModelConfig
 */
export interface ModelConfigUpdateData {
	config: UserModelConfig;
	message: string;
}

/**
 * Response data for testModelConfig
 */
export interface ModelConfigTestData {
	testResult: ModelTestResult;
	message: string;
}

/**
 * Response data for resetAllConfigs
 */
export interface ModelConfigResetData {
	resetCount: number;
	message: string;
}

/**
 * Response data for getDefaults
 */
export interface ModelConfigDefaultsData {
	defaults: Record<AgentActionKey, ModelConfig>;
	message: string;
}

/**
 * Response data for deleteModelConfig
 */
export interface ModelConfigDeleteData {
	message: string;
}

/**
 * Response data for getByokProviders
 */
export interface ByokProvidersData {
	providers: UserProviderStatus[];
	modelsByProvider: ModelsByProvider;
	platformModels: AIModels[];
	/** Friendly display name per model id, for UI labels instead of raw ids. */
	modelLabels: Record<string, string>;
}

/**
 * Response data for getModelConfigsInfo (same shape the WebSocket
 * `model_configs_info` message uses, reused so the Settings picker and the
 * chat-header "Model Info" popup share one source of truth).
 */
export interface AgentDisplayConfigData {
	key: string;
	name: string;
	description: string;
	constraint?: {
		enabled: boolean;
		allowedModels: string[];
	};
}

export interface ModelConfigsInfoData {
	agents: AgentDisplayConfigData[];
	userConfigs: Record<string, ModelConfig>;
	defaultConfigs: Record<string, ModelConfig>;
	message: string;
}
