import { Plugin } from "@opencode/plugin"
import { createProviderController, type ConfiguredProvider, type Inventory } from "./catalog.js"
import { discoverInventory, type CatalogProvider } from "./discovery.js"
import { parseProviderDiscoveryOptions, type ProviderDiscoveryOptions } from "./provider-config.js"
import { registerDiscoveryTools, type DiscoveryStatusInput, type DiscoveryStatusProviderReport, formatStatusReport } from "./tools.js"
import type { RefreshResult } from "./tools.js"
import { createV2StorageCache } from "./storage-cache.js"
import { discoveryCacheKey, isDiscoveryCacheFresh, sanitizeSensitiveFields } from "../core/discovery-cache.js"
import { resolveProviderCredential } from "./credential-resolver.js"
import { DiscoveryRpcDefinition, type RpcCacheEntry, type RpcProviderState } from "./rpc.js"
import { applyModelOverride, deleteModelOverride, listModelOverrides, setModelOverride } from "./overrides.js"
import {
  applyDisabledProviders,
  isProviderEnabled,
  loadDisabledProviders,
  saveDisabledProviders,
} from "./provider-prefs.js"

export function integrationID(providerID: string): string {
  return providerID
}

const DEFAULT_REFRESH_INTERVAL_SECONDS = 300

/**
 * Periodic refresh keeps the catalog alive without user action. Providers may
 * opt into a different cadence; the smallest positive value wins and 0 disables
 * the timer only when every provider asks for it.
 */
export function resolveRefreshIntervalSeconds(discovery: ReadonlyMap<string, ProviderDiscoveryOptions>): number {
  const configured = [...discovery.values()]
    .map((options) => options.refreshIntervalSeconds)
    .filter((value): value is number => typeof value === "number")
  if (configured.length === 0) return DEFAULT_REFRESH_INTERVAL_SECONDS
  if (configured.every((value) => value === 0)) return 0
  const positive = configured.filter((value) => value > 0)
  return positive.length > 0 ? Math.min(...positive) : DEFAULT_REFRESH_INTERVAL_SECONDS
}

interface ListedProvider {
  readonly id?: unknown
  readonly name?: unknown
  readonly package?: unknown
  readonly settings?: unknown
}

function providerList(value: unknown): ListedProvider[] {
  const entries = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { data?: unknown }).data)
      ? (value as { data: unknown[] }).data
      : []
  return entries.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return []
    const record = entry as { provider?: unknown }
    const provider = record.provider && typeof record.provider === "object" ? record.provider : entry
    return [provider as ListedProvider]
  })
}

interface RegistryProvider {
  readonly id: string
  readonly name?: string
  readonly modelCount: number
}

/**
 * Every provider the host knows about, including providers without discovery
 * settings, so the settings page can switch any of them like OpenCode's own
 * model list does.
 */
function providerRecords(value: unknown): RegistryProvider[] {
  const entries = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { data?: unknown }).data)
      ? (value as { data: unknown[] }).data
      : []
  return entries.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return []
    const record = entry as { provider?: unknown; models?: unknown }
    const provider = record.provider && typeof record.provider === "object" ? record.provider : entry
    const id = (provider as ListedProvider).id
    if (typeof id !== "string") return []
    const models = record.models
    const modelCount = models instanceof Map
      ? models.size
      : Array.isArray(models)
        ? models.length
        : 0
    const name = (provider as ListedProvider).name
    return [{ id, name: typeof name === "string" ? name : undefined, modelCount }]
  })
}

async function configuredProviders(ctx: Plugin.Context): Promise<{
  providers: ConfiguredProvider[]
  discovery: Map<string, ProviderDiscoveryOptions>
}> {
  const fromList = (listed: ListedProvider[]) => {
    const providers: ConfiguredProvider[] = []
    const discovery = new Map<string, ProviderDiscoveryOptions>()
    for (const entry of listed) {
      if (typeof entry.id !== "string" || typeof entry.package !== "string") continue
      if (!entry.settings || typeof entry.settings !== "object" || Array.isArray(entry.settings)) continue
      const settings = entry.settings as Record<string, unknown>
      const parsed = parseProviderDiscoveryOptions(settings.modelsDiscovery)
      if (!parsed) continue
      providers.push({
        id: entry.id,
        name: typeof entry.name === "string" ? entry.name : undefined,
        package: entry.package,
        settings,
      })
      discovery.set(entry.id, parsed)
    }
    return { providers, discovery }
  }

  const listInput = ctx.location ? { location: ctx.location } : undefined
  try {
    let configured = fromList(providerList(await ctx.provider.list(listInput as never)))
    if (configured.providers.length === 0) {
      await ctx.provider.reload()
      configured = fromList(providerList(await ctx.provider.list(listInput as never)))
    }
    if (configured.providers.length > 0) return configured
  } catch {
    // Provider listing is unavailable; discovery remains inactive for this setup.
  }

  return { providers: [], discovery: new Map() }
}

async function resolveProviderCredentials(ctx: Plugin.Context, providers: readonly CatalogProvider[]): Promise<CatalogProvider[]> {
  return Promise.all(providers.map(async (provider) => {
    const apiKey = await resolveProviderCredential(ctx, provider, integrationID)
    return { ...provider, apiKey }
  }))
}

export async function setupV2(ctx: Plugin.Context): Promise<() => void> {
  const providers: ConfiguredProvider[] = []
  const discovery = new Map<string, ProviderDiscoveryOptions>()
  const controller = createProviderController(ctx, providers, integrationID)
  const disabledProviders = new Set<string>()
  for (const providerID of await loadDisabledProviders(ctx.storage)) disabledProviders.add(providerID)
  let baselineInventory: Inventory = new Map()
  let transformsRegistration: Promise<void> | undefined
  const modelDomain = ctx.model && typeof ctx.model.transform === "function" ? ctx.model : undefined

  // Provider switches keep every provider registered and suppress only its
  // models, so the settings page can switch it back on later. The transform
  // replays after each provider reload and covers models discovered afterwards.
  if (modelDomain) {
    await modelDomain.transform((editor) => {
      applyDisabledProviders({
        list: (providerID) => editor.list(providerID as never) as unknown as readonly { readonly id: string; readonly enabled?: boolean }[],
        disable: (providerID, modelID) => {
          editor.update(providerID as never, modelID as never, (model) => {
            model.enabled = false
          })
        },
      }, disabledProviders)
    })
  }

  const reloadModels = async (): Promise<void> => {
    if (modelDomain && typeof modelDomain.reload === "function") await modelDomain.reload()
  }

  const providerStates = async (): Promise<RpcProviderState[]> => {
    const inventory = controller.getInventory()
    const listInput = ctx.location ? { location: ctx.location } : undefined
    let registry: RegistryProvider[]
    try {
      registry = providerRecords(await ctx.provider.list(listInput as never))
    } catch {
      registry = []
    }
    // The provider route omits models, so counts come from the model registry.
    const modelCounts = new Map<string, number>()
    try {
      const listed = await ctx.model.list()
      const models = Array.isArray(listed) ? listed : listed?.data ?? []
      for (const model of models) {
        modelCounts.set(model.providerID, (modelCounts.get(model.providerID) ?? 0) + 1)
      }
    } catch {
      // Older hosts without a model registry keep the inventory counts.
    }
    // Fall back to the discovery inventory when the host registry is unreadable.
    const source: RegistryProvider[] = registry.length > 0
      ? registry
      : providers.map((provider) => ({
          id: provider.id,
          name: provider.name,
          modelCount: inventory.get(provider.id)?.size ?? 0,
        }))
    return source.map((provider) => ({
      id: provider.id,
      name: provider.name ?? provider.id,
      enabled: isProviderEnabled(disabledProviders, provider.id),
      modelCount: modelCounts.get(provider.id) ?? inventory.get(provider.id)?.size ?? provider.modelCount,
    }))
  }

  const ensureTransformsRegistered = async (): Promise<void> => {
    if (!transformsRegistration) {
      transformsRegistration = Promise.all([
        ctx.integration.transform((draft) => {
          for (const provider of providers) {
            const id = (provider.settings.integrationID as string | undefined) ?? integrationID(provider.id)
            if (!draft.get(id)) {
              draft.update(id, (current) => {
                current.id = id
                current.name = provider.name ?? provider.id
              })
            }
            draft.method.update({
              integrationID: id,
              method: { type: "key", label: "API key" },
            })
          }
        }),
        ctx.provider.transform(controller.transform),
      ]).then(async () => {
        try {
          await ctx.integration.reload()
        } catch {
          // Non-fatal if integration reload is unsupported
        }
      })
    }
    await transformsRegistration
  }

  const syncConfiguredProviders = async (): Promise<boolean> => {
    const configured = await configuredProviders(ctx)
    providers.splice(0, providers.length, ...configured.providers)
    discovery.clear()
    for (const [id, options] of configured.discovery) discovery.set(id, options)

    await ensureTransformsRegistered()
    return configured.providers.length > 0
  }

  const refreshInventoryInternal = async (force?: boolean): Promise<RefreshResult> => {
    const resolved = await resolveProviderCredentials(ctx, providers)
    providers.splice(0, providers.length, ...resolved)
    const discoveredInventory = await discoverInventory(
      resolved,
      discovery,
      fetch,
      ctx.storage ? createV2StorageCache(ctx.storage) : undefined,
      { force }
    )
    const previousInventory = controller.getInventory()
    const inventory: Inventory = new Map()
    for (const provider of resolved) {
      const discovered = discoveredInventory.get(provider.id)
      if (discovered) {
        inventory.set(provider.id, discovered)
        baselineInventory.set(provider.id, new Map(discovered))
      } else {
        // A failed request is represented by a missing provider entry. Keep the
        // last known inventory so a transient outage does not erase models.
        inventory.set(provider.id, previousInventory.get(provider.id) ?? new Map())
      }
    }
    for (const providerID of [...baselineInventory.keys()]) {
      if (!resolved.some((provider) => provider.id === providerID)) baselineInventory.delete(providerID)
    }
    const storedOverrides = await listModelOverrides(ctx.storage)
    const overrideByModel = new Map(storedOverrides.map((override) => [`${override.providerID}:${override.modelID}`, override]))
    for (const [providerID, models] of inventory) {
      for (const [modelID, model] of models) {
        const override = overrideByModel.get(`${providerID}:${modelID}`) ?? overrideByModel.get(`${providerID}:${model.modelID}`)
        if (override) models.set(modelID, applyModelOverride(model as unknown as Record<string, unknown>, override) as unknown as typeof model)
      }
    }
    await controller.replaceInventory(inventory)
    return controller.status()
  }

  let activeRefresh: Promise<RefreshResult> | undefined
  let pendingRefreshForce = false

  const refreshFromCurrentConfig = (force?: boolean, reloadProviderConfig = false): Promise<RefreshResult> => {
    if (force) pendingRefreshForce = true
    if (activeRefresh) {
      return activeRefresh.then(() => refreshFromCurrentConfig(pendingRefreshForce, reloadProviderConfig))
    }
    const runForce = force || pendingRefreshForce
    pendingRefreshForce = false
    activeRefresh = (async () => {
      try {
        // Configuration events update the host provider registry asynchronously, so
        // reload it before listing providers. A normal discovery refresh must not do
        // this first: the host can rebuild its catalog with an empty inventory while
        // the new models request is still in flight, causing a transient 404.
        if (reloadProviderConfig) await ctx.provider.reload()
        await syncConfiguredProviders()
        return await refreshInventoryInternal(runForce)
      } finally {
        activeRefresh = undefined
      }
    })()
    return activeRefresh
  }

  const collectStatus = async (options?: DiscoveryStatusInput): Promise<DiscoveryStatusProviderReport[]> => {
    const inventory = controller.getInventory()
    const reports: DiscoveryStatusProviderReport[] = []
    const storageBackend = ctx.storage ? createV2StorageCache(ctx.storage) : undefined

    for (const provider of providers) {
      const providerDiscoveryOptions = discovery.get(provider.id)
        const modelsMap = inventory.get(provider.id)
        const models = modelsMap ? [...modelsMap.values()] : []
      const cacheConfig = providerDiscoveryOptions?.cache

      let storageCacheInfo: DiscoveryStatusProviderReport["storageCache"] | undefined
      if (storageBackend) {
        const cacheKey = discoveryCacheKey("opencode.models-discovery.v2", provider.id)
        try {
          const raw = await storageBackend.get(cacheKey)
          const entry = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : undefined
          if (entry && entry.version === 1) {
            const fetchedAt = typeof entry.fetchedAt === "string" ? entry.fetchedAt : undefined
            const ttl = cacheConfig?.ttlSeconds ?? 86400
            const fresh = fetchedAt ? isDiscoveryCacheFresh(fetchedAt, ttl) : false
            const rawModels = Array.isArray(entry.rawModels) ? (entry.rawModels as readonly Record<string, unknown>[]) : []
            const enrichments = entry.enrichments && typeof entry.enrichments === "object" ? (entry.enrichments as Record<string, unknown>) : {}

            storageCacheInfo = {
              exists: true,
              fresh,
              fetchedAt,
              rawModelCount: rawModels.length,
              rawModels: options?.rawCache ? sanitizeSensitiveFields(rawModels) as readonly Record<string, unknown>[] : undefined,
              enrichments: options?.rawCache ? sanitizeSensitiveFields(enrichments) as Record<string, unknown> : undefined,
            }
          } else {
            storageCacheInfo = { exists: false, fresh: false }
          }
        } catch {
          storageCacheInfo = { exists: false, fresh: false }
        }
      }

      reports.push({
        id: provider.id,
        name: provider.name,
        enabled: providerDiscoveryOptions?.enabled ?? false,
        cacheConfig,
        storageCache: storageCacheInfo,
        models,
      })
    }

    return options?.providerID ? reports.filter((provider) => provider.id === options.providerID) : reports
  }

  const inspectStatus = async (options?: DiscoveryStatusInput): Promise<string> =>
    formatStatusReport(await collectStatus(options), options)

  await ensureTransformsRegistered()
  await registerDiscoveryTools(ctx, refreshFromCurrentConfig, inspectStatus)

  if (ctx.rpc && typeof ctx.rpc.register === "function") {
    await ctx.rpc.register(DiscoveryRpcDefinition, {
      status: async (rawInput) => {
        const input = rawInput as DiscoveryStatusInput | undefined
        await syncConfiguredProviders()
        const reports = await collectStatus(input)
        const overrides = await listModelOverrides(ctx.storage, input?.providerID)
        const overrideByModel = new Map(overrides.map((override) => [`${override.providerID}:${override.modelID}`, override]))
        return {
          report: formatStatusReport(reports, input),
          providers: reports.map((provider) => ({
            id: provider.id,
            name: provider.name ?? provider.id,
            modelCount: provider.models.length,
            enabled: isProviderEnabled(disabledProviders, provider.id),
            models: provider.models.map((model) => ({
              id: model.id,
              name: model.name,
              defaultValues: (() => {
                const baseline = baselineInventory.get(provider.id)?.get(model.id) ?? baselineInventory.get(provider.id)?.get(model.modelID)
                return baseline ? {
                  name: baseline.name,
                  limit: baseline.limit,
                  capabilities: baseline.capabilities,
                  ...(baseline.reasoning !== undefined ? { reasoning: baseline.reasoning } : {}),
                  ...(baseline.attachment !== undefined ? { attachment: baseline.attachment } : {}),
                } : undefined
              })(),
              detail: [
                `Model: ${model.name}`,
                "",
                "Identity",
                `  Provider: ${provider.name ?? provider.id} (${provider.id})`,
                `  Model ID: ${model.id}`,
                `  API Model ID: ${model.modelID}`,
                "",
                "Limits",
                `  Context: ${model.limit.context.toLocaleString()}`,
                `  Output: ${model.limit.output.toLocaleString()}`,
                `  Input: ${model.limit.input?.toLocaleString() ?? "unknown"}`,
                "",
                "Capabilities",
                `  Tools: ${model.capabilities.tools ? "yes" : "no"}`,
                `  Reasoning: ${model.reasoning === undefined ? "unknown" : model.reasoning ? "yes" : "no"}`,
                `  Attachments: ${model.attachment === undefined ? "unknown" : model.attachment ? "yes" : "no"}`,
                `  Input: ${model.capabilities.input.join(", ") || "unknown"}`,
                `  Output: ${model.capabilities.output.join(", ") || "unknown"}`,
                `  Variants: ${model.variants?.map((variant) => variant.id).join(", ") || "none"}`,
                ...(overrideByModel.has(`${provider.id}:${model.id}`) || overrideByModel.has(`${provider.id}:${model.modelID}`)
                  ? ["", "Override", `  Updated: ${(overrideByModel.get(`${provider.id}:${model.id}`) ?? overrideByModel.get(`${provider.id}:${model.modelID}`))?.updatedAt ?? "unknown"}`, `  Fields: ${Object.keys((overrideByModel.get(`${provider.id}:${model.id}`) ?? overrideByModel.get(`${provider.id}:${model.modelID}`))?.patch ?? {}).join(", ")}`]
                  : []),
              ].join("\n"),
              ...((overrideByModel.get(`${provider.id}:${model.id}`) ?? overrideByModel.get(`${provider.id}:${model.modelID}`))
                ? { override: overrideByModel.get(`${provider.id}:${model.id}`) ?? overrideByModel.get(`${provider.id}:${model.modelID}`) }
                : {}),
            })),
          })),
        }
      },
      refresh: async (rawInput) => {
        const input = rawInput as { readonly force?: boolean } | undefined
        const result = await refreshFromCurrentConfig(input?.force !== false)
        return { providers: result.providers, models: result.models }
      },
      cacheInspect: async (rawInput) => {
        const input = rawInput as { readonly providerID?: string } | undefined
        await syncConfiguredProviders()
        const storageBackend = ctx.storage ? createV2StorageCache(ctx.storage) : undefined
        const targetProviders = input?.providerID
          ? providers.filter((p) => p.id === input.providerID)
          : providers
        const entries: RpcCacheEntry[] = []

        if (input?.providerID && targetProviders.length === 0) {
          if (storageBackend) {
            const cacheKey = discoveryCacheKey("opencode.models-discovery.v2", input.providerID)
            try {
              const raw = await storageBackend.get(cacheKey)
              const entry = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : undefined
              if (entry && entry.version === 1) {
                const fetchedAt = typeof entry.fetchedAt === "string" ? entry.fetchedAt : undefined
                const rawModels = Array.isArray(entry.rawModels) ? entry.rawModels : []
                entries.push({
                  providerID: input.providerID,
                  status: fetchedAt ? (isDiscoveryCacheFresh(fetchedAt, 86400) ? "fresh" : "expired") : "expired",
                  fetchedAt,
                  ttlSeconds: 86400,
                  modelCount: rawModels.length,
                })
              } else {
                entries.push({ providerID: input.providerID, status: entry ? "corrupt" : "empty" })
              }
            } catch {
              entries.push({ providerID: input.providerID, status: "corrupt" })
            }
          } else {
            entries.push({ providerID: input.providerID, status: "empty" })
          }
          return { entries }
        }

        for (const provider of targetProviders) {
          const providerDiscoveryOptions = discovery.get(provider.id)
          const cacheConfig = providerDiscoveryOptions?.cache
          if (!storageBackend || !cacheConfig?.enabled) {
            entries.push({ providerID: provider.id, status: "empty" })
            continue
          }
          const cacheKey = discoveryCacheKey("opencode.models-discovery.v2", provider.id)
          try {
            const raw = await storageBackend.get(cacheKey)
            const entry = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : undefined
            if (entry && entry.version === 1) {
              const fetchedAt = typeof entry.fetchedAt === "string" ? entry.fetchedAt : undefined
              const ttl = cacheConfig.ttlSeconds ?? 86400
              const fresh = fetchedAt ? isDiscoveryCacheFresh(fetchedAt, ttl) : false
              const rawModels = Array.isArray(entry.rawModels) ? entry.rawModels : []
              entries.push({
                providerID: provider.id,
                status: fresh ? "fresh" : "expired",
                fetchedAt,
                ttlSeconds: ttl,
                modelCount: rawModels.length,
              })
            } else {
              entries.push({ providerID: provider.id, status: entry ? "corrupt" : "empty" })
            }
          } catch {
            entries.push({ providerID: provider.id, status: "corrupt" })
          }
        }
        return { entries }
      },
      cacheClear: async (rawInput) => {
        const input = rawInput as { readonly providerID?: string } | undefined
        const storageBackend = ctx.storage ? createV2StorageCache(ctx.storage) : undefined
        if (!storageBackend?.remove) return { cleared: 0 }

        await syncConfiguredProviders()
        let clearedCount = 0
        const targetIDs = input?.providerID
          ? [input.providerID]
          : providers.map((p) => p.id)

        for (const providerID of targetIDs) {
          const cacheKey = discoveryCacheKey("opencode.models-discovery.v2", providerID)
          try {
            await storageBackend.remove(cacheKey)
            clearedCount++
          } catch {
            // Ignore individual delete errors
          }
        }
        return { cleared: clearedCount }
      },
      overrideList: async (rawInput) => {
        const input = rawInput as { readonly providerID?: string } | undefined
        return { overrides: await listModelOverrides(ctx.storage, input?.providerID) }
      },
      overrideSet: async (rawInput) => {
        const input = rawInput as { readonly providerID: string; readonly modelID: string; readonly patch: Record<string, unknown>; readonly enabled?: boolean }
        const override = await setModelOverride(ctx.storage, input)
        await refreshFromCurrentConfig(true)
        return { success: true, override }
      },
      overrideDelete: async (rawInput) => {
        const input = rawInput as { readonly providerID: string; readonly modelID: string }
        const deleted = await deleteModelOverride(ctx.storage, input.providerID, input.modelID)
        await refreshFromCurrentConfig(true)
        return { success: deleted }
      },
      providerList: async () => {
        await syncConfiguredProviders()
        return { providers: await providerStates() }
      },
      providerSetEnabled: async (rawInput) => {
        const input = rawInput as { readonly providerID: string; readonly enabled: boolean }
        await syncConfiguredProviders()
        const known = (await providerStates()).some((provider) => provider.id === input.providerID)
        if (!known) {
          throw new Error(`Unknown provider: ${input.providerID}`)
        }
        if (input.enabled) disabledProviders.delete(input.providerID)
        else disabledProviders.add(input.providerID)
        try {
          await saveDisabledProviders(ctx.storage, disabledProviders)
        } catch (error) {
          // Keep the in-memory switch aligned with storage when persisting fails.
          if (input.enabled) disabledProviders.add(input.providerID)
          else disabledProviders.delete(input.providerID)
          throw error
        }
        await reloadModels()
        return { providers: await providerStates() }
      },
    })
  }

  await refreshFromCurrentConfig()

  const abort = new AbortController()

  const refreshIntervalSeconds = resolveRefreshIntervalSeconds(discovery)
  let refreshTimer: ReturnType<typeof setInterval> | undefined
  if (refreshIntervalSeconds > 0) {
    refreshTimer = setInterval(() => {
      if (abort.signal.aborted) return
      void refreshFromCurrentConfig().catch(() => {
        // A failed refresh is non-fatal: the inventory keeps its last known state.
      })
    }, refreshIntervalSeconds * 1000)
    ;(refreshTimer as { unref?: () => void }).unref?.()
  }

  if (providers.length === 0) {
    void (async () => {
      for (let attempt = 0; attempt < 10 && !abort.signal.aborted; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 250))
        const result = await refreshFromCurrentConfig()
        if (result.providers > 0) {
          break
        }
      }
    })()
  }
  void (async () => {
    try {
      for await (const event of ctx.event.subscribe({signal: abort.signal})) {
        if (
          event.type === "config.updated" ||
          event.type === "credential.updated" ||
          event.type === "credential.switched" ||
          event.type === "integration.updated"
        ) {
          try {
            // Configuration and credential updates are delivered independently from the provider
            // registry. Reload the registry first so provider.list() observes the
            // new state before rebuilding the discovery inventory.
            await refreshFromCurrentConfig(undefined, true)
          } catch {
            if (!abort.signal.aborted) {
              // should not happen, but if it does, we don't want to crash the plugin
            }
          }
        }
      }
    } catch {
      if (!abort.signal.aborted) {
        // should not happen, but if it does, we don't want to crash the plugin
      }
    }
  })()

  return () => {
    abort.abort()
    if (refreshTimer) clearInterval(refreshTimer)
  }
}

export default Plugin.define({
  id: "opencode-models-discovery",
  setup: setupV2,
})

export { createProviderController, type DiscoveredV2Model, type Inventory } from "./catalog.js"
