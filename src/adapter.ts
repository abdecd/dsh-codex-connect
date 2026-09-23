/** OpenAI Codex adapter assembled from public dsh-llm-pi-ai extension points. */

import { createModels } from '@earendil-works/pi-ai'
import type { AuthContext, Context as PiContext, Model, MutableModels, Provider, SimpleStreamOptions } from '@earendil-works/pi-ai'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import type { ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import type { OpenAICodexCredentialStore } from './store.ts'
import { OPENAI_CODEX_PROVIDER } from './store.ts'
import type { FastModeRegistry } from './fast-mode.ts'

/** Provider idle ceiling used by the composite route. */
export const OPENAI_CODEX_STREAM_IDLE_TIMEOUT_MS = 300_000
const OPENAI_CODEX_MAX_REQUEST_IMAGE_BYTES = 20 * 1024 * 1024
/** Inline request image budgets mirroring the dsh-llm-pi-ai adapter defaults (2048px normalized, 1MiB raw). */
const OPENAI_CODEX_REQUEST_IMAGE_PIXEL_BUDGET = 2048 * 2048
const OPENAI_CODEX_REQUEST_IMAGE_MAX_BYTES = 1024 * 1024
const OPENAI_CODEX_BASE_URL = 'https://chatgpt.com/backend-api'
const OPENAI_CODEX_GPT6_MODEL: Model<'openai-codex-responses'> = {
  id: 'gpt-6-astra',
  name: 'GPT-6 Astra',
  api: 'openai-codex-responses',
  provider: OPENAI_CODEX_PROVIDER,
  baseUrl: OPENAI_CODEX_BASE_URL,
  reasoning: true,
  thinkingLevelMap: {
    off: null,
    minimal: 'low',
    low: 'low',
    medium: 'medium',
    high: 'high',
    xhigh: 'xhigh',
    max: 'max',
  },
  input: ['text', 'image'],
  cost: {
    input: 10,
    output: 50,
    cacheRead: 1,
    cacheWrite: 12.5,
    tiers: [{
      inputTokensAbove: 272_000,
      input: 20,
      output: 75,
      cacheRead: 2,
      cacheWrite: 25,
    }],
  },
  contextWindow: 272_000,
  maxTokens: 128_000,
  compat: {
    supportsOpenAIGrammarTools: true,
    supportsToolSearch: true,
  },
}
const OPENAI_CODEX_GPT6_PICKER_MODELS: readonly Model<'openai-codex-responses'>[] = [
  { ...OPENAI_CODEX_GPT6_MODEL, id: 'gpt-6-luna', name: 'GPT-6 Luna' },
  { ...OPENAI_CODEX_GPT6_MODEL, id: 'gpt-6-solar', name: 'GPT-6 Solar' },
]

const openAICodexAuthContext: AuthContext = {
  env: async () => undefined,
  fileExists: async () => false,
}

/**
 * Give the generic dsh adapter a request-scoped bearer-token entry without
 * changing the provider's user-facing OAuth flow. The resolver accepts only
 * the explicit override supplied by this plugin; it never discovers an API
 * key from the environment or persistent api-key credentials.
 */
function isPayloadRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Add the request-scoped Fast Mode hint without changing auth or other options. */
export function withOpenAICodexFastMode(
  provider: Provider,
  fastMode: FastModeRegistry | undefined,
): Provider {
  const streamSimple = provider.streamSimple
  return {
    ...provider,
    streamSimple(model, context: PiContext, options?: SimpleStreamOptions) {
      const sessionId = options?.sessionId
      const enabled = provider.id === OPENAI_CODEX_PROVIDER
        && model.provider === OPENAI_CODEX_PROVIDER
        && fastMode !== undefined
        && fastMode.isEnabled(sessionId)
      if (!enabled) return streamSimple.call(provider, model, context, options)
      const previousOnPayload = options?.onPayload
      const nextOptions: SimpleStreamOptions = {
        ...options,
        async onPayload(payload, payloadModel) {
          const replaced = await previousOnPayload?.(payload, payloadModel)
          const nextPayload = replaced === undefined ? payload : replaced
          return isPayloadRecord(nextPayload)
            ? { ...nextPayload, service_tier: 'priority' }
            : nextPayload
        },
      }
      return streamSimple.call(provider, model, context, nextOptions)
    },
  }
}

function requestProvider(provider: Provider, fastMode?: FastModeRegistry): Provider {
  return {
    ...withOpenAICodexFastMode(provider, fastMode),
    auth: {
      ...provider.auth,
      apiKey: {
        name: 'OpenAI Codex OAuth bearer token',
        async resolve({ credential }) {
          const apiKey = credential?.key
          return apiKey === undefined || apiKey.length === 0
            ? undefined
            : { auth: { apiKey }, source: 'OAuth' }
        },
      },
    },
  }
}

/**
 * Create the Codex subscription adapter without requiring a dsh fork. The
 * public pi-ai adapter owns Harness message conversion, image attachment
 * resolution, streaming, reasoning metadata, and compaction behavior; this
 * plugin supplies its provider-native OAuth token for each request.
 */
export function createOpenAICodexAdapter(
  credentials: OpenAICodexCredentialStore,
  resolveAttachments: () => AttachmentStore | undefined,
  fastMode?: FastModeRegistry,
  resolveEnabledModels?: () => readonly string[] | undefined,
): PiAiAdapter {
  const upstreamProvider = openaiCodexProvider()
  const upstreamGetModels = upstreamProvider.getModels.bind(upstreamProvider)
  // Backport GPT-6 catalog entries missing from pinned pi-ai. The Codex
  // Responses transport is model-id based, so no separate request path is needed.
  const provider: Provider<'openai-codex-responses'> = {
    ...upstreamProvider,
    getModels: () => {
      const models = upstreamGetModels()
      const additions = [OPENAI_CODEX_GPT6_MODEL, ...OPENAI_CODEX_GPT6_PICKER_MODELS]
        .filter(model => !models.some(existing => existing.id === model.id))
      return additions.length === 0 ? models : [...models, ...additions]
    },
  }
  const profiles = new Map<string, ResolvedPiAiProviderProfile>([[OPENAI_CODEX_PROVIDER, {
    provider: OPENAI_CODEX_PROVIDER,
    displayName: 'OpenAI Codex',
    streamIdleTimeoutMs: OPENAI_CODEX_STREAM_IDLE_TIMEOUT_MS,
    maxRequestImageBytes: OPENAI_CODEX_MAX_REQUEST_IMAGE_BYTES,
    requestImagePixelBudget: OPENAI_CODEX_REQUEST_IMAGE_PIXEL_BUDGET,
    requestImageMaxBytes: OPENAI_CODEX_REQUEST_IMAGE_MAX_BYTES,
    retryPolicy: resolveRetryPolicy(undefined, 'dsh-codex-connect retryPolicy'),
    configuredMaxTokens: new Map(),
    modelErrors: new Map(),
    piProvider: requestProvider(provider, fastMode),
  }]])
  const models: MutableModels = createModels({ credentials })
  models.setProvider(provider)
  const adapter = new PiAiAdapter({
    profiles: () => profiles,
    resolveApiKey: async () => (await models.getAuth(OPENAI_CODEX_PROVIDER))?.auth.apiKey,
    auth: {
      credentials,
      authContext: openAICodexAuthContext,
    },
    resolveAttachments,
  })
  const listModels = adapter.listModels.bind(adapter)
  // Model-directory membership is advisory in dsh-llm. Filter only the
  // discovery result so existing or manually supplied model routes remain
  // resolvable through the complete provider catalog.
  adapter.listModels = async providerId => {
    const listed = await listModels(providerId)
    const enabledModels = resolveEnabledModels?.()
    if (enabledModels === undefined) return listed
    const enabled = new Set(enabledModels)
    return listed.filter(model => enabled.has(model.id))
  }
  return adapter
}
