/* eslint-disable no-console */
import { type ConfiguredProvider, type DiscoveredV2Model, type Inventory } from "./catalog.js"
import { type ProviderDiscoveryOptions } from "./provider-config.js"
import { mapToDiscoveredV2Model } from "../core/model-mapper.js"
import { discoverModelDrafts } from "../core/discovery-pipeline.js"
import { isDiscoveredRawModel } from "../core/model-types.js"
import { prepareModelEnricher, type ModelEnrichmentResult, type ModelEnricher } from "../core/model-enrichment.js"
import { createDiscoveryCacheEntry, discoveryCacheKey, isDiscoveryCacheFresh, readStaleDiscoveryCache, writeDiscoveryCache, type DiscoveryCacheBackend } from "../core/discovery-cache.js"
import { resolveModelInfoEnricher } from "../core/enricher-resolver.js"
import { buildDiscoveryURL } from "../core/model-info-url.js"

export interface DiscoveryLogger {
  warn(message: string, context?: Record<string, unknown>): void
  info?(message: string, context?: Record<string, unknown>): void
  debug?(message: string, context?: Record<string, unknown>): void
  error?(message: string, context?: Record<string, unknown>): void
}

const defaultLogger: DiscoveryLogger = {
  warn(message, context) {
    if (context && Object.keys(context).length > 0) {
      console.warn(`[opencode-models-discovery] ${message}`, context)
    } else {
      console.warn(`[opencode-models-discovery] ${message}`)
    }
  },
  info(message, context) {
    if (context && Object.keys(context).length > 0) {
      console.info(`[opencode-models-discovery] ${message}`, context)
    } else {
      console.info(`[opencode-models-discovery] ${message}`)
    }
  },
}

export interface CatalogProvider extends ConfiguredProvider {
  /** Ephemeral request credential resolved by the plugin refresh orchestration. */
  readonly apiKey?: string
}

function cachedEnricher(enrichments: Record<string, ModelEnrichmentResult>): ModelEnricher {
  return {
    enrich(model) {
      return enrichments[model.id] ?? {}
    },
  }
}

export async function discoverInventory(
  providers: readonly CatalogProvider[],
  discovery: ReadonlyMap<string, ProviderDiscoveryOptions>,
  fetcher: typeof fetch = fetch,
  storage?: DiscoveryCacheBackend,
  options?: { readonly force?: boolean; readonly logger?: DiscoveryLogger },
): Promise<Inventory> {
  const inventory: Inventory = new Map()
  const logger = options?.logger ?? defaultLogger

  await Promise.all(providers.map(async (provider) => {
    const config = discovery.get(provider.id)
    if (!config) return

    const baseURL = typeof provider.settings.baseURL === "string" ? provider.settings.baseURL : undefined
    if (!baseURL) {
      logger.warn(`Model discovery skipped for provider "${provider.id}": missing or invalid settings.baseURL`, {
        provider: provider.id,
      })
      return
    }

    const cacheConfig = config.cache
    const cacheSupported = cacheConfig?.enabled === true && storage !== undefined
    const cacheReadable = cacheSupported && options?.force !== true
    const endpoint = config.endpoint
    const identity = {
      providerID: provider.id,
      baseURL,
      endpoint,
      modelInfoFormat: config.modelInfoFormat,
      modelInfoEndpoint: config.modelInfoEndpoint,
    }
    const cacheKey = discoveryCacheKey("opencode.models-discovery.v2", provider.id)
    const cacheEntry = cacheSupported
      ? await readStaleDiscoveryCache(storage, cacheKey, identity)
      : undefined
    const cached = cacheReadable && cacheEntry && cacheConfig && isDiscoveryCacheFresh(cacheEntry.fetchedAt, cacheConfig.ttlSeconds)
      ? cacheEntry
      : undefined
    // A stale entry is never served while a refresh is possible: it is only used
    // when the network request fails, so a cold start cannot leave the provider empty.
    const stale = cacheSupported && cacheEntry && cacheEntry !== cached ? cacheEntry : undefined

    const resolvedApiKey = typeof provider.apiKey === "string" && provider.apiKey.trim().length > 0
      ? provider.apiKey.trim()
      : (typeof provider.settings.apiKey === "string" && provider.settings.apiKey.trim().length > 0 ? provider.settings.apiKey.trim() : undefined)

    const url = buildDiscoveryURL(baseURL, config.endpoint)
    const headers = new Headers({ accept: "application/json" })
    if (resolvedApiKey) headers.set("authorization", `Bearer ${resolvedApiKey}`)

    const mapModels = async (
      rawModels: readonly unknown[],
      enricher: ModelEnricher | undefined,
      fromCache: boolean,
    ): Promise<Map<string, DiscoveredV2Model>> => {
      if (!fromCache) {
        await prepareModelEnricher(
          enricher,
          rawModels.filter(isDiscoveredRawModel).map((model) => model.id),
        )
      }

      const enrichments: Record<string, ModelEnrichmentResult> = {}
      const recordingEnricher = enricher
        ? { enrich(model: Parameters<ModelEnricher['enrich']>[0], context: Parameters<ModelEnricher['enrich']>[1]) {
            const result = enricher!.enrich(model, context)
            if (!fromCache) enrichments[model.id] = result
            return result
          } } satisfies ModelEnricher
        : undefined
      const drafts = discoverModelDrafts(rawModels, {
        filter: {
          includeBy: config.includeBy.map((filter) => ({ ...filter, match: filter.match ? new RegExp(filter.match) : undefined })),
          excludeBy: config.excludeBy.map((filter) => ({ ...filter, match: filter.match ? new RegExp(filter.match) : undefined })),
          includeRegex: config.includeRegex,
          excludeRegex: config.excludeRegex,
        },
        smartModelName: config.smartModelName,
        enricher: recordingEnricher,
        enrichmentContext: { filterNonChat: config.filterNonChat },
      })
      const models = new Map<string, DiscoveredV2Model>(drafts.map((draft) => [draft.id, mapToDiscoveredV2Model(draft, config)]))

      if (cacheSupported && !fromCache) {
        await writeDiscoveryCache(storage, cacheKey, createDiscoveryCacheEntry(identity,
          rawModels.filter((model): model is Record<string, unknown> =>
            !!model && typeof model === "object" && !Array.isArray(model) && typeof (model as Record<string, unknown>).id === "string"
          ), enrichments))
      }
      return models
    }

    const useStaleCache = async (reason: string): Promise<boolean> => {
      if (!stale) return false
      const ageSeconds = Math.max(0, Math.floor((Date.now() - Date.parse(stale.fetchedAt)) / 1000))
      logger.warn(`Model discovery falling back to cached models for provider "${provider.id}"`, {
        provider: provider.id,
        url,
        reason,
        fetchedAt: stale.fetchedAt,
        ageSeconds,
      })
      try {
        inventory.set(provider.id, await mapModels(stale.rawModels, cachedEnricher(stale.enrichments), true))
        return true
      } catch (error) {
        logger.warn(`Model discovery cached models are unusable for provider "${provider.id}"`, {
          provider: provider.id,
          url,
          error: error instanceof Error ? error.message : String(error),
        })
        return false
      }
    }

    try {
      if (cached) {
        inventory.set(provider.id, await mapModels(cached.rawModels, cachedEnricher(cached.enrichments), true))
        return
      }

      const [modelsResponse, resolvedEnricher] = await Promise.all([
        fetcher(url, {
          headers,
          signal: AbortSignal.timeout(config.timeoutMs),
        }),
        resolveModelInfoEnricher({
          baseURL,
          apiKey: resolvedApiKey,
          providerName: provider.id,
          fetcher,
          logger: {
            warn: (message, context) => logger.warn(message, context),
            info: (message, context) => logger.info?.(message, context),
          },
        }, {
          format: config.modelInfoFormat,
          endpoint: config.modelInfoEndpoint,
          filterNonChat: config.filterNonChat,
          timeoutMs: config.timeoutMs,
        }),
      ])

      if (!modelsResponse.ok) {
        logger.warn(`Model discovery request failed for provider "${provider.id}"`, {
          provider: provider.id,
          url,
          status: modelsResponse.status,
          statusText: modelsResponse.statusText,
        })
        await useStaleCache(`request failed with status ${modelsResponse.status}`)
        return
      }

      const payload = await modelsResponse.json() as { data?: unknown }
      if (!Array.isArray(payload?.data)) {
        logger.warn(`Model discovery returned invalid payload for provider "${provider.id}": expected array in "data" property`, {
          provider: provider.id,
          url,
          payloadType: typeof payload,
          keys: payload && typeof payload === "object" && !Array.isArray(payload) ? Object.keys(payload) : undefined,
        })
        await useStaleCache("invalid payload")
        return
      }

      inventory.set(provider.id, await mapModels(payload.data, resolvedEnricher, false))
    } catch (error) {
      logger.warn(`Model discovery error for provider "${provider.id}"`, {
        provider: provider.id,
        url,
        error: error instanceof Error ? error.message : String(error),
      })
      // Network and parsing failures are non-fatal: prefer the last known model
      // list over an empty provider catalog.
      await useStaleCache(error instanceof Error ? error.message : String(error))
    }
  }))

  return inventory
}
