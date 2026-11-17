import type { Plugin } from "@opencode/plugin"

export const PROVIDER_PREFS_KEY = "providers:disabled"

export interface StoredProviderPrefs {
  readonly version: 1
  readonly disabled: readonly string[]
  readonly updatedAt: string
}

type Storage = Plugin.Context["storage"]

export interface ProviderSwitchState {
  readonly id: string
  readonly name: string
  readonly enabled: boolean
}

export interface ProviderModelSource {
  list(providerID: string): readonly { readonly id: string; readonly enabled?: boolean }[]
  disable(providerID: string, modelID: string): void
}

function isStoredProviderPrefs(value: unknown): value is StoredProviderPrefs {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return record.version === 1 && Array.isArray(record.disabled) && record.disabled.every((entry) => typeof entry === "string")
}

export async function loadDisabledProviders(storage: Storage | undefined): Promise<Set<string>> {
  if (!storage) return new Set()
  try {
    const stored = await storage.get(PROVIDER_PREFS_KEY)
    return isStoredProviderPrefs(stored) ? new Set(stored.disabled) : new Set()
  } catch {
    return new Set()
  }
}

export async function saveDisabledProviders(storage: Storage | undefined, disabled: ReadonlySet<string>): Promise<StoredProviderPrefs> {
  if (!storage) throw new Error("V2 storage is unavailable; provider switches cannot be persisted")
  const prefs: StoredProviderPrefs = {
    version: 1,
    disabled: [...disabled].filter(Boolean).sort(),
    updatedAt: new Date().toISOString(),
  }
  await storage.set(PROVIDER_PREFS_KEY, prefs as never)
  return prefs
}

export function isProviderEnabled(disabled: ReadonlySet<string>, providerID: string): boolean {
  return !disabled.has(providerID)
}

/**
 * A disabled provider stays registered so this page can always switch it back
 * on; only its models are suppressed. Removing the provider from the registry
 * instead would make it unreachable, because provider discovery reads the
 * active registry.
 *
 * Model transforms replay after every provider reload, so models discovered
 * later are suppressed as well. The returned count reports what changed.
 */
export function applyDisabledProviders(source: ProviderModelSource, disabled: ReadonlySet<string>): number {
  let changed = 0
  for (const providerID of disabled) {
    for (const model of source.list(providerID)) {
      if (model.enabled === false) continue
      source.disable(providerID, String(model.id))
      changed++
    }
  }
  return changed
}
