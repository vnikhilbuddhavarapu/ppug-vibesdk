/**
 * Human-facing display metadata (label + description) for each AgentConfig
 * role, keyed separately from AGENT_CONFIG. `ModelConfig.name` is the
 * underlying model id, not a display label for the action itself — this map
 * is the single source of truth the model-config UI (Settings picker + the
 * chat-header "Model Info" popup) uses to render each action.
 */
import { AgentActionKey } from './config.types';

export interface AgentActionMetadata {
	name: string;
	description: string;
}

export const AGENT_ACTION_METADATA: Record<
	AgentActionKey,
	AgentActionMetadata
> = {
	templateSelection: {
		name: 'Template Selection',
		description: 'Picks the starting project template for a new app.',
	},
	blueprint: {
		name: 'Blueprint',
		description: 'Designs the overall architecture and plan for the app.',
	},
	projectSetup: {
		name: 'Project Setup',
		description:
			'Scaffolds the initial project structure and dependencies.',
	},
	phaseGeneration: {
		name: 'Phase Planning',
		description: 'Breaks the build into sequential implementation phases.',
	},
	phaseImplementation: {
		name: 'Phase Implementation',
		description: 'Implements each planned phase of the app.',
	},
	firstPhaseImplementation: {
		name: 'First Phase Implementation',
		description: 'Implements the foundational first phase of the app.',
	},
	fileRegeneration: {
		name: 'File Regeneration',
		description: 'Regenerates individual files that need fixing or rework.',
	},
	screenshotAnalysis: {
		name: 'Screenshot Analysis',
		description: 'Analyzes UI screenshots to guide visual fixes.',
	},
	realtimeCodeFixer: {
		name: 'Realtime Code Fixer',
		description: 'Fixes code issues detected live during generation.',
	},
	fastCodeFixer: {
		name: 'Fast Code Fixer',
		description: 'Applies quick, low-latency fixes for small code issues.',
	},
	conversationalResponse: {
		name: 'Conversational Response',
		description: 'Generates chat responses to the user during a build.',
	},
	deepDebugger: {
		name: 'Deep Debugger',
		description: 'Performs deeper investigation for hard-to-fix bugs.',
	},
	agenticProjectBuilder: {
		name: 'Agentic Project Builder',
		description: 'Legacy single-shot conversational build pipeline.',
	},
	think: {
		name: 'Think Agent',
		description: 'The Think coding agent that builds and deploys your app.',
	},
};
