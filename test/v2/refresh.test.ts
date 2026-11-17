import { afterEach, describe, expect, it, vi } from "vitest"
import { resolveRefreshIntervalSeconds, setupV2 } from "../../src/v2/index.js"
import { parseProviderDiscoveryOptions } from "../../src/v2/provider-config.js"

function provider(settings: Record<string, unknown>) {
  return {
    id: "test-prov",
    name: "Test Provider",
    package: "@opencode/ai/providers/openai-compatible",
    settings: {
      baseURL: "http://localhost:11434",
      ...settings,
    },
  }
}

function context(list: ReturnType<typeof vi.fn>, storage: Map<string, unknown>) {
  return {
    provider: {
      list,
      transform: vi.fn(),
      reload: vi.fn().mockResolvedValue(undefined),
    },
    integration: {
      transform: vi.fn(),
      reload: vi.fn().mockResolvedValue(undefined),
      connection: {
        active: vi.fn().mockResolvedValue(undefined),
        resolve: vi.fn().mockResolvedValue(undefined),
      },
    },
    tool: { transform: vi.fn() },
    command: { transform: vi.fn(), reload: vi.fn().mockResolvedValue(undefined) },
    event: { subscribe: vi.fn().mockReturnValue({ [Symbol.asyncIterator]: async function* () {} }) },
    storage: {
      get: vi.fn(async (key: string) => storage.get(key)),
      set: vi.fn(async (key: string, value: unknown) => { storage.set(key, value) }),
      remove: vi.fn(async (key: string) => { storage.delete(key) }),
    },
  }
}

describe("periodic discovery refresh", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("re-runs discovery on the configured interval", async () => {
    vi.useFakeTimers()
    const storage = new Map<string, unknown>()
    storage.set("opencode.models-discovery.v2:provider:test-prov", {
      version: 1,
      identity: { providerID: "test-prov", baseURL: "http://localhost:11434", endpoint: "/v1/models" },
      fetchedAt: new Date().toISOString(),
      rawModels: [{ id: "m1" }],
      enrichments: {},
    })

    const list = vi.fn().mockResolvedValue([provider({
      modelsDiscovery: {
        enabled: true,
        refreshIntervalSeconds: 30,
        cache: { enabled: true, ttlSeconds: 3600 },
      },
    })])

    const dispose = await setupV2(context(list, storage) as any)
    expect(list).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(30_000)
    for (let attempt = 0; attempt < 25 && list.mock.calls.length < 2; attempt++) {
      await Promise.resolve()
    }

    expect(list.mock.calls.length).toBeGreaterThanOrEqual(2)
    dispose()
  })

  it("does not schedule a timer when every provider disables refresh", async () => {
    vi.useFakeTimers()
    const storage = new Map<string, unknown>()
    storage.set("opencode.models-discovery.v2:provider:test-prov", {
      version: 1,
      identity: { providerID: "test-prov", baseURL: "http://localhost:11434", endpoint: "/v1/models" },
      fetchedAt: new Date().toISOString(),
      rawModels: [{ id: "m1" }],
      enrichments: {},
    })

    const list = vi.fn().mockResolvedValue([provider({
      modelsDiscovery: {
        enabled: true,
        refreshIntervalSeconds: 0,
        cache: { enabled: true, ttlSeconds: 3600 },
      },
    })])

    const dispose = await setupV2(context(list, storage) as any)
    expect(list).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(3_600_000)
    expect(list).toHaveBeenCalledTimes(1)
    dispose()
  })
})

describe("resolveRefreshIntervalSeconds", () => {
  const options = (refreshIntervalSeconds?: number) =>
    parseProviderDiscoveryOptions({ enabled: true, refreshIntervalSeconds })!

  it("defaults to five minutes when no provider sets a cadence", () => {
    expect(resolveRefreshIntervalSeconds(new Map())).toBe(300)
    expect(resolveRefreshIntervalSeconds(new Map([["a", options()]]))).toBe(300)
  })

  it("uses the smallest positive interval across providers", () => {
    expect(resolveRefreshIntervalSeconds(new Map([
      ["a", options(120)],
      ["b", options(45)],
    ]))).toBe(45)
    expect(resolveRefreshIntervalSeconds(new Map([
      ["a", options(0)],
      ["b", options(120)],
    ]))).toBe(120)
  })

  it("disables the timer only when every provider asks for it", () => {
    expect(resolveRefreshIntervalSeconds(new Map([
      ["a", options(0)],
      ["b", options(0)],
    ]))).toBe(0)
  })

  it("ignores invalid cadence values", () => {
    expect(parseProviderDiscoveryOptions({ enabled: true, refreshIntervalSeconds: -5 })!.refreshIntervalSeconds).toBeUndefined()
    expect(parseProviderDiscoveryOptions({ enabled: true, refreshIntervalSeconds: Number.NaN })!.refreshIntervalSeconds).toBeUndefined()
    expect(parseProviderDiscoveryOptions({ enabled: true, refreshIntervalSeconds: 45.7 })!.refreshIntervalSeconds).toBe(45)
  })
})
