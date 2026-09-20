/**
 * Workers AI models for this event's Think agent, routed through AI
 * Gateway's universal `/compat` endpoint (no BYOK provider key needed — same
 * account token as the rest of the platform, same pattern as the existing
 * `grok/*`/`google-vertex-ai/*` entries in config.types.ts).
 *
 * Kept in its own file so the event's 7-model catalog can be edited without
 * touching the rest of MODELS_MASTER. Pricing/context sourced from the
 * account's live Workers AI catalog (`/ai/models/search`) at registration
 * time; creditCost follows the same baseline as config.types.ts
 * (GPT-5 Mini $0.25/1M input = 1.0 credit).
 */
import { ModelSize } from './modelSize';
import type { AIModelConfig } from './config.types';

export const WORKERS_AI_MODELS_MASTER = {
	DEEPSEEK_V4_PRO: {
		id: 'workers-ai/@cf/deepseek-ai/deepseek-v4-pro-0813',
		config: {
			name: 'DeepSeek V4 Pro',
			size: ModelSize.LARGE,
			provider: 'workers-ai',
			creditCost: 5.3, // $1.32/1M input
			contextSize: 1_048_576,
		},
	},
	DEEPSEEK_V4_FLASH: {
		id: 'workers-ai/@cf/deepseek-ai/deepseek-v4-flash-0731',
		config: {
			name: 'DeepSeek V4 Flash',
			size: ModelSize.REGULAR,
			provider: 'workers-ai',
			creditCost: 1.8, // $0.44/1M input
			contextSize: 1_310_720,
		},
	},
	KIMI_K2_6: {
		id: 'workers-ai/@cf/moonshotai/kimi-k2.6',
		config: {
			name: 'Kimi K2.6',
			size: ModelSize.REGULAR,
			provider: 'workers-ai',
			creditCost: 3.8, // $0.95/1M input
			contextSize: 262_144,
		},
	},
	KIMI_K2_7_CODE: {
		id: 'workers-ai/@cf/moonshotai/kimi-k2.7-code',
		config: {
			name: 'Kimi K2.7 Code',
			size: ModelSize.REGULAR,
			provider: 'workers-ai',
			creditCost: 3.8, // $0.95/1M input
			contextSize: 262_144,
		},
	},
	GLM_5_2: {
		id: 'workers-ai/@cf/zai-org/glm-5.2',
		config: {
			name: 'GLM 5.2',
			size: ModelSize.REGULAR,
			provider: 'workers-ai',
			creditCost: 5.6, // $1.40/1M input
			contextSize: 262_144,
		},
	},
	GLM_5_3: {
		id: 'workers-ai/@cf/zai-org/glm-5.3',
		config: {
			name: 'GLM 5.3',
			size: ModelSize.REGULAR,
			provider: 'workers-ai',
			creditCost: 5.6, // $1.40/1M input
			contextSize: 1_310_720,
		},
	},
	GLM_5_3_FLASH: {
		id: 'workers-ai/@cf/zai-org/glm-5.3-flash',
		config: {
			name: 'GLM 5.3 Flash',
			size: ModelSize.LITE,
			provider: 'workers-ai',
			creditCost: 0.6, // $0.15/1M input
			contextSize: 1_310_720,
		},
	},
} as const satisfies Record<string, { id: string; config: AIModelConfig }>;

/**
 * Embeddings model(s) available to *deployed apps* through the runtime AI
 * proxy's `/embeddings` path (RAG chunk/query embedding — see the
 * `agent-primitives`/`knowledge-base-rag`/`doc-rag-citations` skills).
 * Deliberately kept out of `WORKERS_AI_MODELS_MASTER`/`MODELS_MASTER`: an
 * embeddings-only model can't do chat/reasoning, so it must never appear in
 * Think's own selectable-model catalog (Configure modal, model-selector).
 * Only `worker/services/aigateway-proxy/controller.ts` consumes this.
 *
 * `bge-base-en-v1.5` outputs 768-dim vectors, matching
 * `ProvisioningService`'s default Vectorize index dimension.
 */
export const WORKERS_AI_EMBEDDING_MODELS = {
	BGE_BASE_EN_V1_5: {
		id: 'workers-ai/@cf/baai/bge-base-en-v1.5',
		config: {
			name: 'BGE Base EN v1.5 (embeddings)',
			size: ModelSize.LITE,
			provider: 'workers-ai',
			creditCost: 0.05, // $0.013/1M input tokens
			contextSize: 512,
		},
	},
} as const satisfies Record<string, { id: string; config: AIModelConfig }>;
