/** Node-free settings contract shared by the Host plugin and browser card. */

/** Stable Harness settings namespace owned by this plugin. */
export const OPENAI_CODEX_SETTINGS_NAMESPACE = 'llm-openai-codex'

/** Search modes accepted by the Codex standalone search endpoint. */
export type OpenAICodexSearchMode = 'cached' | 'indexed' | 'live'

/** Search-context sizes accepted by the Codex standalone search endpoint. */
export type OpenAICodexSearchContextSize = 'low' | 'medium' | 'high'

/** Models offered by the Codex model picker in Plugin settings. */
export const OPENAI_CODEX_MODEL_OPTIONS = [
  { id: 'gpt-5.3-codex-spark', name: 'GPT-5.3 Codex Spark' },
  { id: 'gpt-5.4', name: 'GPT-5.4' },
  { id: 'gpt-5.4-mini', name: 'GPT-5.4 mini' },
  { id: 'gpt-5.5', name: 'GPT-5.5' },
  { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra' },
  { id: 'gpt-6-luna', name: 'GPT-6 Luna' },
  { id: 'gpt-6-solar', name: 'GPT-6 Solar' },
  { id: 'gpt-6-astra', name: 'GPT-6 Astra' },
] as const

/** Default to showing every model known by this plugin. */
export const DEFAULT_OPENAI_CODEX_ENABLED_MODELS = OPENAI_CODEX_MODEL_OPTIONS.map(model => model.id)

const REPLACED_OPENAI_CODEX_MODEL_IDS = new Map<string, string>([
  ['gpt-5.6-luna', 'gpt-6-luna'],
  ['gpt-5.6-sol', 'gpt-6-solar'],
])

function normalizeModelId(id: string): string {
  return REPLACED_OPENAI_CODEX_MODEL_IDS.get(id) ?? id
}

function normalizeEnabledModels(modelIds: readonly string[]): string[] {
  return [...new Set(modelIds.map(normalizeModelId))]
}

/** Default model used by the standalone search endpoint. */
export const DEFAULT_OPENAI_CODEX_SEARCH_MODEL = 'gpt-5.6-sol'
/** Default search mode, matching the official local Codex client. */
export const DEFAULT_OPENAI_CODEX_SEARCH_MODE: OpenAICodexSearchMode = 'cached'
/** Default provider search-context size. */
export const DEFAULT_OPENAI_CODEX_SEARCH_CONTEXT_SIZE: OpenAICodexSearchContextSize = 'medium'
/** Default output budget for the standalone search response. */
export const DEFAULT_OPENAI_CODEX_SEARCH_MAX_OUTPUT_TOKENS = 10_000

/** Fully resolved user-editable section presented by Plugin configuration. */
export interface OpenAICodexSettingsConfig {
  /** Exact model ids shown by the conversation model picker. */
  enabledModels: string[]
  enableSearch: boolean
  enableImageTool: boolean
  enableImageGeneration: boolean
  searchModel: string
  searchMode: OpenAICodexSearchMode
  searchContextSize: OpenAICodexSearchContextSize
  searchMaxOutputTokens: number
}

export const DEFAULT_OPENAI_CODEX_SETTINGS: Readonly<OpenAICodexSettingsConfig> = Object.freeze({
  enabledModels: [...DEFAULT_OPENAI_CODEX_ENABLED_MODELS],
  enableSearch: false,
  enableImageTool: false,
  enableImageGeneration: false,
  searchModel: DEFAULT_OPENAI_CODEX_SEARCH_MODEL,
  searchMode: DEFAULT_OPENAI_CODEX_SEARCH_MODE,
  searchContextSize: DEFAULT_OPENAI_CODEX_SEARCH_CONTEXT_SIZE,
  searchMaxOutputTokens: DEFAULT_OPENAI_CODEX_SEARCH_MAX_OUTPUT_TOKENS,
})

/** Fill the schema defaults even when called without Cordis validation. */
export function resolveOpenAICodexSettings(
  value: Partial<OpenAICodexSettingsConfig>,
): OpenAICodexSettingsConfig {
  return {
    ...DEFAULT_OPENAI_CODEX_SETTINGS,
    ...value,
    enabledModels: value.enabledModels === undefined
      ? [...DEFAULT_OPENAI_CODEX_ENABLED_MODELS]
      : normalizeEnabledModels(value.enabledModels),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Narrow the redacted settings wire payload before it enters React state. */
export function decodeOpenAICodexSettings(value: unknown): OpenAICodexSettingsConfig | undefined {
  if (!isRecord(value)) return undefined
  const enabledModels = value['enabledModels']
  const enableSearch = value['enableSearch']
  const enableImageTool = value['enableImageTool']
  const enableImageGeneration = value['enableImageGeneration']
  const searchModel = value['searchModel']
  const searchMode = value['searchMode']
  const searchContextSize = value['searchContextSize']
  const searchMaxOutputTokens = value['searchMaxOutputTokens']
  if (enabledModels !== undefined
    && (!Array.isArray(enabledModels)
      || enabledModels.length === 0
      || enabledModels.some(model => typeof model !== 'string' || model.trim().length === 0))) return undefined
  if (typeof enableSearch !== 'boolean' || typeof enableImageTool !== 'boolean') return undefined
  // Older Host snapshots predate image generation; absence maps to its safe default.
  if (enableImageGeneration !== undefined && typeof enableImageGeneration !== 'boolean') return undefined
  if (typeof searchModel !== 'string' || searchModel.trim().length === 0) return undefined
  if (searchMode !== 'cached' && searchMode !== 'indexed' && searchMode !== 'live') return undefined
  if (searchContextSize !== 'low' && searchContextSize !== 'medium' && searchContextSize !== 'high') return undefined
  if (typeof searchMaxOutputTokens !== 'number' || !Number.isInteger(searchMaxOutputTokens) || searchMaxOutputTokens < 1) return undefined
  return {
    enabledModels: enabledModels === undefined
      ? [...DEFAULT_OPENAI_CODEX_ENABLED_MODELS]
      : normalizeEnabledModels(enabledModels as string[]),
    enableSearch,
    enableImageTool,
    enableImageGeneration: enableImageGeneration ?? false,
    searchModel,
    searchMode,
    searchContextSize,
    searchMaxOutputTokens,
  }
}
