import { describe, expect, it, vi } from "vitest"
import {
  applyDisabledProviders,
  isProviderEnabled,
  loadDisabledProviders,
  PROVIDER_PREFS_KEY,
  saveDisabledProviders,
  type ProviderModelSource,
} from "../../src/v2/provider-prefs.js"

function storage() {
  const values = new Map<string, unknown>()
  return {
    values,
    get: vi.fn(async (key: string) => values.get(key)),
    set: vi.fn(async (key: string, value: unknown) => { values.set(key, value) }),
    remove: vi.fn(async (key: string) => { values.delete(key) }),
  }
}

function source(models: Record<string, { id: string; enabled?: boolean }[]>): ProviderModelSource & { disabled: [string, string][] } {
  const disabled: [string, string][] = []
  const current = new Map(Object.entries(models))
  return {
    disabled,
    list: (providerID) => current.get(providerID) ?? [],
    disable: (providerID, modelID) => {
      disabled.push([providerID, modelID])
      const target = current.get(providerID)?.find((model) => model.id === modelID)
      if (target) target.enabled = false
    },
  }
}

describe("V2 provider switches", () => {
  it("defaults to every provider enabled without stored preferences", async () => {
    const disabled = await loadDisabledProviders(undefined)
    expect(disabled.size).toBe(0)
    expect(await loadDisabledProviders(storage())).toEqual(new Set())
  })

  it("persists the disabled set sorted and restores it", async () => {
    const backend = storage()
    await saveDisabledProviders(backend, new Set(["zeta", "alpha", ""]))

    expect(backend.values.get(PROVIDER_PREFS_KEY)).toMatchObject({
      version: 1,
      disabled: ["alpha", "zeta"],
    })
    expect(await loadDisabledProviders(backend)).toEqual(new Set(["alpha", "zeta"]))
  })

  it("ignores corrupt preference records", async () => {
    const backend = storage()
    backend.values.set(PROVIDER_PREFS_KEY, { version: 2, disabled: ["alpha"] })
    expect(await loadDisabledProviders(backend)).toEqual(new Set())

    backend.values.set(PROVIDER_PREFS_KEY, { version: 1, disabled: [42] })
    expect(await loadDisabledProviders(backend)).toEqual(new Set())
  })

  it("reports availability from the disabled set", () => {
    const disabled = new Set(["off"])
    expect(isProviderEnabled(disabled, "off")).toBe(false)
    expect(isProviderEnabled(disabled, "on")).toBe(true)
  })

  it("suppresses only models of disabled providers and skips already disabled models", () => {
    const models = source({
      off: [{ id: "a" }, { id: "b", enabled: false }],
      on: [{ id: "c" }],
    })

    expect(applyDisabledProviders(models, new Set(["off"]))).toBe(1)
    expect(models.disabled).toEqual([["off", "a"]])
  })

  it("is idempotent when the transform replays", () => {
    const models = source({ off: [{ id: "a" }] })
    expect(applyDisabledProviders(models, new Set(["off"]))).toBe(1)
    expect(applyDisabledProviders(models, new Set(["off"]))).toBe(0)
  })
})
