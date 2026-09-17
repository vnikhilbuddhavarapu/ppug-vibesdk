/**
 * Split out from config.types.ts to break a circular runtime dependency:
 * config.types.ts imports WORKERS_AI_MODELS_MASTER from workersAiModels.ts,
 * which needs this enum's runtime values (not just its type).
 */
export enum ModelSize {
	LITE = 'lite',
	REGULAR = 'regular',
	LARGE = 'large',
}
