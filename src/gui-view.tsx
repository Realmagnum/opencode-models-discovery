import { For, Show, createEffect, createSignal, onMount } from "solid-js"
import { DiscoveryRpcDefinition, type RpcModelOverride, type RpcProviderState, type RpcStatusOutput } from "./v2/rpc.js"
import { resolveTranslation, type TranslationParams } from "./i18n.js"

interface Props {
  readonly client: () => any
  readonly servers: { list(): readonly string[]; get(id: string): { name: string; client: any; connected: boolean; compatible: boolean } | undefined }
  readonly t?: (key: string, params?: TranslationParams) => string
  readonly locale?: () => string | undefined
  readonly toast?: {
    show(options: { title: string; message: string; variant?: "info" | "success" | "warning" | "error" }): void
  }
}

const PLUGIN_ID = "opencode-models-discovery"
const SERVER_STORAGE_KEY = "opencode-models-discovery:server"

function readStoredServer(): string {
  try {
    return window.localStorage.getItem(SERVER_STORAGE_KEY) || "sidecar"
  } catch {
    return "sidecar"
  }
}

function rememberServer(id: string): void {
  try {
    window.localStorage.setItem(SERVER_STORAGE_KEY, id)
  } catch {
    // Private storage or a locked profile; the picker still works for this window.
  }
}

interface ServerInstall {
  readonly type: "package" | "local" | "unknown"
  readonly target?: string
  readonly path?: string
  readonly version?: string
  readonly outdated?: boolean
}

interface ServerEntry {
  readonly id: string
  readonly name: string
  readonly canToggle: boolean
  readonly install: ServerInstall
}

interface ProviderRow {
  readonly id: string
  readonly name: string
  readonly enabled: boolean
  readonly discovered: boolean
  readonly modelCount: number
  readonly models: RpcStatusOutput["providers"][number]["models"]
}

function pluginInstall(info: any): ServerInstall {
  const source = info?.source
  if (!source || typeof source !== "object") return { type: "unknown" }
  if (source.type === "package") {
    return {
      type: "package",
      target: typeof source.target === "string" ? source.target : undefined,
      version: typeof source.version === "string" ? source.version : undefined,
      outdated: source.outdated === true,
    }
  }
  if (source.type === "local") {
    return { type: "local", path: typeof source.path === "string" ? source.path : undefined }
  }
  return { type: "unknown" }
}

function isThisPlugin(info: any): boolean {
  if (!info || typeof info !== "object") return false
  if (info.id === PLUGIN_ID) return true
  const source = info.source
  if (!source || typeof source !== "object") return false
  if (typeof source.target === "string" && source.target.includes(PLUGIN_ID)) return true
  if (typeof source.path === "string" && source.path.includes(PLUGIN_ID)) return true
  return false
}

const sectionHeader: Record<string, string> = {
  "font-size": "14px",
  "font-weight": "600",
  "margin-top": "24px",
  "margin-bottom": "12px",
  color: "var(--text-default, #eceff4)",
  "border-bottom": "1px solid var(--border-subtle, rgba(255, 255, 255, 0.1))",
  "padding-bottom": "6px",
  display: "flex",
  "justify-content": "space-between",
  "align-items": "center",
}

const cardStyle: Record<string, string> = {
  background: "var(--background-surface, rgba(255, 255, 255, 0.03))",
  border: "1px solid var(--border-default, rgba(255, 255, 255, 0.08))",
  "border-radius": "8px",
  padding: "16px",
  display: "flex",
  "flex-direction": "column",
  gap: "12px",
  "margin-bottom": "14px",
}

const buttonPrimary: Record<string, string> = {
  background: "var(--interactive-accent, #3b82f6)",
  color: "#ffffff",
  border: "none",
  "border-radius": "6px",
  padding: "6px 14px",
  "font-size": "12px",
  "font-weight": "500",
  cursor: "pointer",
  transition: "all 0.15s ease",
}

const buttonSecondary: Record<string, string> = {
  background: "var(--background-action-neutral, rgba(255, 255, 255, 0.08))",
  border: "1px solid var(--border-default, rgba(255, 255, 255, 0.15))",
  color: "var(--text-default, #eceff4)",
  "border-radius": "6px",
  padding: "5px 10px",
  "font-size": "12px",
  cursor: "pointer",
}

const buttonDanger: Record<string, string> = {
  background: "rgba(239, 68, 68, 0.15)",
  border: "1px solid rgba(239, 68, 68, 0.3)",
  color: "#f87171",
  "border-radius": "6px",
  padding: "4px 8px",
  "font-size": "11px",
  cursor: "pointer",
}

const badgeStyle = (active: boolean): Record<string, string> => ({
  display: "inline-flex",
  "align-items": "center",
  padding: "2px 8px",
  "border-radius": "12px",
  "font-size": "11px",
  "font-weight": "500",
  background: active ? "rgba(34, 197, 94, 0.15)" : "rgba(148, 163, 184, 0.15)",
  color: active ? "#4ade80" : "#94a3b8",
  border: `1px solid ${active ? "rgba(34, 197, 94, 0.3)" : "rgba(148, 163, 184, 0.3)"}`,
})

const tagStyle: Record<string, string> = {
  display: "inline-block",
  padding: "1px 6px",
  "border-radius": "4px",
  "font-size": "10.5px",
  background: "rgba(255, 255, 255, 0.06)",
  color: "var(--text-subdued, #94a3b8)",
  "margin-right": "4px",
}

export function SettingsView(props: Props) {
  const t = (key: string, params?: TranslationParams): string => {
    if (props.t) {
      const val = props.t(key, params)
      if (val && val !== key) return val
    }
    return resolveTranslation(props.locale?.(), key, params)
  }

  const [loading, setLoading] = createSignal(false)
  const [serverID, setServerID] = createSignal(readStoredServer())
  const [availableServers, setAvailableServers] = createSignal<ServerEntry[]>([])
  const [serversChecked, setServersChecked] = createSignal(false)
  const [updatingServer, setUpdatingServer] = createSignal(false)
  const [togglingProvider, setTogglingProvider] = createSignal<string | null>(null)
  let serverSelect: HTMLSelectElement | undefined

  const chooseServer = (id: string) => {
    setServerID(id)
    rememberServer(id)
  }

  // Solid renders <option> children after the select's value binding, so a
  // rebuilt option list can leave the browser on the first entry. Reapply the
  // selected value once the new options exist.
  createEffect(() => {
    const id = serverID()
    availableServers()
    queueMicrotask(() => {
      if (serverSelect && serverSelect.value !== id) serverSelect.value = id
    })
  })
  let statusRequest = 0
  const [refreshing, setRefreshing] = createSignal(false)
  const [statusData, setStatusData] = createSignal<RpcStatusOutput | null>(null)
  const [providerStates, setProviderStates] = createSignal<RpcProviderState[]>([])
  const [search, setSearch] = createSignal("")
  const [selectedProvider, setSelectedProvider] = createSignal<string>("all")
  const [editingModel, setEditingModel] = createSignal<{
    providerID: string
    modelID: string
    currentName: string
    override?: RpcModelOverride
  } | null>(null)

  // Accordion collapsed state: providerID -> boolean (true = expanded, default false = collapsed)
  const [expandedProviders, setExpandedProviders] = createSignal<Record<string, boolean>>({})

  const isProviderExpanded = (providerID: string) => {
    // If user is searching, expand matching providers automatically
    if (search().trim().length > 0) return true
    return expandedProviders()[providerID] === true
  }

  const toggleProvider = (providerID: string) => {
    setExpandedProviders((prev) => ({
      ...prev,
      [providerID]: !isProviderExpanded(providerID),
    }))
  }

  const expandAll = () => {
    const data = statusData()
    if (!data) return
    const next: Record<string, boolean> = {}
    for (const p of data.providers) next[p.id] = true
    setExpandedProviders(next)
  }

  const collapseAll = () => {
    setExpandedProviders({})
  }

  // Edit form state
  const [editName, setEditName] = createSignal("")
  const [editContext, setEditContext] = createSignal<string>("")
  const [editOutput, setEditOutput] = createSignal<string>("")
  const [editTools, setEditTools] = createSignal<boolean>(true)
  const [editReasoning, setEditReasoning] = createSignal<boolean>(false)

  const rpc = () => {
    const client = props.servers.get(serverID())?.client ?? (serverID() === "sidecar" ? props.client() : undefined)
    return client?.rpc ? client.rpc(DiscoveryRpcDefinition) : null
  }

  const currentServer = (): ServerEntry | undefined => availableServers().find((entry) => entry.id === serverID())

  const serverSupportsSwitches = (): boolean => currentServer()?.canToggle ?? false

  const canUpdateServer = (): boolean => {
    const install = currentServer()?.install
    return install?.type === "package" && Boolean(install.target)
  }

  const discoverServers = async () => {
    // The app's own server is addressed as "sidecar" and is not always part of
    // servers.list(), so probe it explicitly with the window's own client.
    const ids = [...new Set(["sidecar", ...props.servers.list()])]
    const results = await Promise.all(ids.map(async (id) => {
      const server = props.servers.get(id)
      const isSidecar = id === "sidecar"
      const client = server?.client ?? (isSidecar ? props.client() : undefined)
      if (!client) return null
      if (server && (!server.connected || !server.compatible)) return null
      const rpc = client.rpc ? client.rpc(DiscoveryRpcDefinition) : null
      if (!rpc) return null
      try {
        await rpc.status({})
      } catch {
        // The plugin is not installed on this server.
        return null
      }
      let canToggle = false
      try {
        // Older plugin builds answer status but have no provider switches.
        await rpc.providerList({})
        canToggle = true
      } catch {
        canToggle = false
      }
      let install: ServerInstall = { type: "unknown" }
      try {
        const listed = await client.plugin.list()
        const entries = Array.isArray(listed) ? listed : listed?.data ?? []
        const info = entries.find(isThisPlugin)
        if (info) install = pluginInstall(info)
      } catch {
        // Plugin inventory is unavailable; fall back to the capability probe.
      }
      const name = server?.name ?? (isSidecar ? t("settings.servers.thisMachine") : id)
      return { id, name, canToggle, install }
    }))
    setAvailableServers(results.filter((entry): entry is ServerEntry => entry !== null))
    setServersChecked(true)
    // Only drop a selection whose server no longer exists in the app. A server
    // that temporarily fails the probe keeps its entry so the choice survives.
    if (serverID() !== "sidecar" && !props.servers.get(serverID())) chooseServer("sidecar")
  }

  const waitForSwitches = async (client: any): Promise<boolean> => {
    for (let attempt = 0; attempt < 12; attempt++) {
      try {
        await client.rpc(DiscoveryRpcDefinition).providerList({})
        return true
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 1_250))
      }
    }
    return false
  }

  const handleUpdateServer = async () => {
    const server = currentServer()
    const install = server?.install
    if (!server || install?.type !== "package" || !install.target) {
      props.toast?.show({
        title: t("settings.servers.updateTitle"),
        message: t("toast.pluginUpdateLocal", { path: install?.path ?? serverID() }),
        variant: "warning",
      })
      return
    }
    const client = props.servers.get(serverID())?.client ?? (serverID() === "sidecar" ? props.client() : undefined)
    if (!client?.plugin?.update) return
    setUpdatingServer(true)
    try {
      await client.plugin.update({ targets: [install.target] })
      const ready = await waitForSwitches(client)
      await discoverServers()
      await fetchStatus()
      props.toast?.show({
        title: t("settings.servers.updateTitle"),
        message: ready ? t("toast.pluginUpdated", { server: server.name }) : t("toast.pluginUpdatedReload", { server: server.name }),
        variant: ready ? "success" : "warning",
      })
    } catch (error: any) {
      props.toast?.show({
        title: t("settings.servers.updateTitle"),
        message: error?.message || t("toast.pluginUpdateFailed"),
        variant: "error",
      })
    } finally {
      setUpdatingServer(false)
    }
  }

  const fetchStatus = async () => {
    const request = ++statusRequest
    const client = rpc()
    if (!client) return
    setLoading(true)
    try {
      const [data, states] = await Promise.all([
        client.status({ details: true, rawCache: true }),
        typeof client.providerList === "function"
          ? client.providerList({}).then((result: { providers: RpcProviderState[] }) => result.providers).catch(() => [])
          : Promise.resolve([]),
      ])
      if (request !== statusRequest) return
      setStatusData(data)
      setProviderStates(states as RpcProviderState[])
    } catch (e: any) {
      if (request === statusRequest) props.toast?.show({
        title: "Model Discovery",
        message: e?.message || "Failed to load discovery status",
        variant: "error",
      })
    } finally {
      if (request === statusRequest) setLoading(false)
    }
  }

  const handleRefresh = async (force: boolean) => {
    const client = rpc()
    if (!client) return
    setRefreshing(true)
    try {
      const res = await client.refresh({ force })
      props.toast?.show({
        title: "Discovery Refreshed",
        message: `Discovered ${res.models} models across ${res.providers} providers.`,
        variant: "success",
      })
      await fetchStatus()
    } catch (e: any) {
      props.toast?.show({
        title: "Refresh Error",
        message: e?.message || "Failed to refresh models",
        variant: "error",
      })
    } finally {
      setRefreshing(false)
    }
  }

  const handleClearCache = async (providerID?: string) => {
    const client = rpc()
    if (!client) return
    try {
      const res = await client.cacheClear({ providerID })
      props.toast?.show({
        title: "Cache Cleared",
        message: `Cleared ${res.cleared} provider caches.`,
        variant: "info",
      })
      await fetchStatus()
    } catch (e: any) {
      props.toast?.show({
        title: "Cache Clear Error",
        message: e?.message || "Failed to clear cache",
        variant: "error",
      })
    }
  }

  const handleToggleProvider = async (providerID: string, enabled: boolean) => {
    const client = rpc()
    if (!client) return
    if (typeof client.providerSetEnabled !== "function") {
      props.toast?.show({
        title: t("toast.providerSwitchTitle"),
        message: t("toast.providerSwitchUnsupported"),
        variant: "warning",
      })
      return
    }
    setTogglingProvider(providerID)
    try {
      await client.providerSetEnabled({ providerID, enabled })
      await fetchStatus()
      props.toast?.show({
        title: t("toast.providerSwitchTitle"),
        message: enabled ? t("toast.providerEnabled", { provider: providerID }) : t("toast.providerDisabled", { provider: providerID }),
        variant: "info",
      })
    } catch (e: any) {
      props.toast?.show({
        title: t("toast.providerSwitchTitle"),
        message: e?.message || t("toast.providerSwitchFailed"),
        variant: "error",
      })
    } finally {
      setTogglingProvider(null)
    }
  }

  const openEditModal = (providerID: string, model: any) => {
    const ov = model.override?.patch
    const def = model.defaultValues
    setEditingModel({
      providerID,
      modelID: model.id,
      currentName: model.name,
      override: model.override,
    })
    setEditName(ov?.name ?? def?.name ?? model.name ?? "")
    setEditContext(ov?.limit?.context !== undefined ? String(ov.limit.context) : def?.limit?.context !== undefined ? String(def.limit.context) : "")
    setEditOutput(ov?.limit?.output !== undefined ? String(ov.limit.output) : def?.limit?.output !== undefined ? String(def.limit.output) : "")
    setEditTools(ov?.capabilities?.tools ?? def?.capabilities?.tools ?? true)
    setEditReasoning(ov?.reasoning ?? def?.reasoning ?? false)
  }

  const handleSaveOverride = async () => {
    const target = editingModel()
    const client = rpc()
    if (!target || !client) return

    const patch: Record<string, any> = {}
    if (editName().trim()) patch.name = editName().trim()
    
    const ctxNum = parseInt(editContext(), 10)
    const outNum = parseInt(editOutput(), 10)
    if (!isNaN(ctxNum) || !isNaN(outNum)) {
      patch.limit = {}
      if (!isNaN(ctxNum)) patch.limit.context = ctxNum
      if (!isNaN(outNum)) patch.limit.output = outNum
    }

    patch.capabilities = { tools: editTools() }
    patch.reasoning = editReasoning()

    try {
      await client.overrideSet({
        providerID: target.providerID,
        modelID: target.modelID,
        patch,
        enabled: true,
      })
      props.toast?.show({
        title: "Override Saved",
        message: `Updated overrides for ${target.modelID}`,
        variant: "success",
      })
      setEditingModel(null)
      await fetchStatus()
    } catch (e: any) {
      props.toast?.show({
        title: "Override Error",
        message: e?.message || "Failed to save override",
        variant: "error",
      })
    }
  }

  const handleDeleteOverride = async (providerID: string, modelID: string) => {
    const client = rpc()
    if (!client) return
    try {
      await client.overrideDelete({ providerID, modelID })
      props.toast?.show({
        title: "Override Removed",
        message: `Reset overrides for ${modelID}`,
        variant: "info",
      })
      setEditingModel(null)
      await fetchStatus()
    } catch (e: any) {
      props.toast?.show({
        title: "Reset Error",
        message: e?.message || "Failed to delete override",
        variant: "error",
      })
    }
  }

  onMount(() => {
    void discoverServers()
    void fetchStatus()
  })

  const providerRows = (): ProviderRow[] => {
    const detail = new Map((statusData()?.providers ?? []).map((provider) => [provider.id, provider]))
    const rows: ProviderRow[] = []
    const seen = new Set<string>()
    for (const state of providerStates()) {
      const discovered = detail.get(state.id)
      rows.push({
        id: state.id,
        name: state.name,
        enabled: state.enabled,
        discovered: Boolean(discovered),
        modelCount: discovered?.modelCount ?? state.modelCount,
        models: discovered?.models ?? [],
      })
      seen.add(state.id)
    }
    for (const provider of detail.values()) {
      if (seen.has(provider.id)) continue
      rows.push({
        id: provider.id,
        name: provider.name,
        enabled: provider.enabled !== false,
        discovered: true,
        modelCount: provider.modelCount,
        models: provider.models,
      })
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name))
  }

  const filteredProviders = () => {
    const provFilter = selectedProvider()
    const q = search().toLowerCase().trim()

    return providerRows()
      .filter((provider) => provFilter === "all" || provider.id === provFilter)
      .filter((provider) => {
        if (!q) return true
        if (provider.id.toLowerCase().includes(q) || provider.name.toLowerCase().includes(q)) return true
        return provider.models.some((model) => model.id.toLowerCase().includes(q) || model.name.toLowerCase().includes(q))
      })
      .map((provider) => {
        if (!q) return provider
        const matchedModels = provider.models.filter(
          (model) => model.id.toLowerCase().includes(q) || model.name.toLowerCase().includes(q)
        )
        return { ...provider, models: matchedModels }
      })
  }

  const totalModels = () => {
    const data = statusData()
    if (!data) return 0
    return data.providers.reduce((sum, p) => sum + p.modelCount, 0)
  }

  return (
    <div style={{ "max-width": "900px", padding: "16px 8px 48px", font: "13px/1.5 system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", "justify-content": "space-between", "align-items": "flex-start", "margin-bottom": "20px" }}>
        <div>
          <div style={{ display: "flex", "align-items": "center", gap: "8px", "margin-bottom": "4px" }}>
            <h2 style={{ "font-size": "18px", "font-weight": "600", margin: "0", color: "var(--text-default, #eceff4)" }}>
              {t("settings.header.title")}
            </h2>
            <span
              style={{
                "font-size": "11px",
                "font-weight": "500",
                color: "#b392f0",
                background: "rgba(157, 124, 216, 0.15)",
                border: "1px solid rgba(157, 124, 216, 0.35)",
                "border-radius": "10px",
                padding: "1px 7px",
                "line-height": "1.4",
              }}
            >
              Plugin
            </span>
          </div>
          <p style={{ "font-size": "12.5px", color: "var(--text-subdued, #94a3b8)", margin: "0" }}>
            {t("settings.header.desc")}
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            style={buttonSecondary}
            onClick={() => handleClearCache()}
            disabled={refreshing() || loading()}
          >
            {t("settings.action.clearCache")}
          </button>
          <button
            style={buttonPrimary}
            onClick={() => handleRefresh(true)}
            disabled={refreshing() || loading()}
          >
            {refreshing() ? t("settings.action.refreshing") : t("settings.action.refresh")}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: "10px", "align-items": "center", "margin-bottom": "16px", "flex-wrap": "wrap" }}>
        <label for="models-discovery-server">{t("settings.server")}</label>
        <select
          id="models-discovery-server"
          ref={(el) => { serverSelect = el ?? undefined }}
          disabled={updatingServer()}
          onChange={(event) => {
            chooseServer(event.currentTarget.value)
            setStatusData(null)
            setSelectedProvider("all")
            setExpandedProviders({})
            setEditingModel(null)
            setTogglingProvider(null)
            void fetchStatus()
          }}
          style={buttonSecondary}
        >
          <Show when={!availableServers().some((server) => server.id === serverID())}>
            <option value={serverID()} selected={true}>{props.servers.get(serverID())?.name ?? serverID()}</option>
          </Show>
          <For each={availableServers()}>
            {(server) => <option value={server.id} selected={server.id === serverID()}>{server.name}</option>}
          </For>
        </select>
        <button style={buttonSecondary} onClick={() => void discoverServers()}>{t("settings.servers.refresh")}</button>
        <Show when={serversChecked() && currentServer()?.install.version}>
          <span style={{ ...tagStyle, "font-size": "11px" }}>{currentServer()?.install.version}</span>
        </Show>
        <Show when={serversChecked() && !serverSupportsSwitches()}>
          <span style={{ "font-size": "11.5px", color: "var(--text-subdued, #94a3b8)" }}>
            {currentServer()?.install.type === "local"
              ? t("settings.servers.localHint", { path: currentServer()?.install.path ?? serverID() })
              : t("settings.servers.switchUnsupported")}
          </span>
        </Show>
        <Show when={serversChecked() && canUpdateServer() && (!serverSupportsSwitches() || currentServer()?.install.outdated)}>
          <button
            style={{ ...buttonSecondary, "font-size": "11.5px", padding: "5px 10px" }}
            title={t("settings.servers.updateHint")}
            disabled={updatingServer()}
            onClick={() => void handleUpdateServer()}
          >
            {updatingServer() ? t("settings.servers.updating") : t("settings.servers.update")}
          </button>
        </Show>
      </div>

      {/* Summary Banner */}
      <div style={cardStyle}>
        <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center" }}>
          <div>
            <span style={{ "font-weight": "600", "font-size": "14px", color: "var(--text-default, #eceff4)" }}>
              Active Inventory:
            </span>{" "}
            <span style={{ color: "var(--text-accent, #60a5fa)", "font-weight": "600" }}>
              {totalModels()} models
            </span>{" "}
            across{" "}
            <span style={{ color: "var(--text-default, #eceff4)", "font-weight": "600" }}>
              {statusData()?.providers.length ?? 0} discovery providers
            </span>{" "}
            <span style={{ color: "var(--text-subdued, #94a3b8)" }}>
              · {providerRows().length} in model picker
            </span>
          </div>
          <button
            style={{ ...buttonSecondary, "font-size": "11px", padding: "3px 8px" }}
            onClick={fetchStatus}
            disabled={loading()}
          >
            {loading() ? "Checking..." : "Reload Status"}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "10px", "margin-bottom": "18px", "align-items": "center" }}>
        <input
          type="text"
          placeholder="Filter models by id or name..."
          value={search()}
          onInput={(e) => setSearch(e.currentTarget.value)}
          style={{
            flex: "1",
            background: "var(--background-input, rgba(0, 0, 0, 0.25))",
            border: "1px solid var(--border-default, rgba(255, 255, 255, 0.15))",
            color: "var(--text-default, #eceff4)",
            "border-radius": "6px",
            padding: "7px 10px",
            "font-size": "12.5px",
            outline: "none",
          }}
        />
        <select
          value={selectedProvider()}
          onChange={(e) => setSelectedProvider(e.currentTarget.value)}
          style={{
            background: "var(--background-input, rgba(0, 0, 0, 0.25))",
            border: "1px solid var(--border-default, rgba(255, 255, 255, 0.15))",
            color: "var(--text-default, #eceff4)",
            "border-radius": "6px",
            padding: "7px 10px",
            "font-size": "12.5px",
            outline: "none",
          }}
        >
          <option value="all">All Providers</option>
          <For each={providerRows()}>
            {(p) => <option value={p.id}>{p.name} ({p.modelCount})</option>}
          </For>
        </select>
        <div style={{ display: "flex", gap: "6px" }}>
          <button
            style={{ ...buttonSecondary, "font-size": "11.5px", padding: "6px 10px" }}
            onClick={expandAll}
          >
            {t("settings.action.expandAll")}
          </button>
          <button
            style={{ ...buttonSecondary, "font-size": "11.5px", padding: "6px 10px" }}
            onClick={collapseAll}
          >
            {t("settings.action.collapseAll")}
          </button>
        </div>
      </div>

      {/* Provider & Model Lists */}
      <For each={filteredProviders()}>
        {(provider) => {
          const expanded = () => isProviderExpanded(provider.id)
          const enabled = () => provider.enabled !== false
          const busy = () => togglingProvider() === provider.id
          return (
            <div style={{ ...cardStyle, ...(enabled() ? {} : { opacity: "0.6" }) }}>
              {/* Provider Header / Accordion Trigger */}
              <div
                style={{
                  display: "flex",
                  "justify-content": "space-between",
                  "align-items": "center",
                  cursor: "pointer",
                  "user-select": "none",
                  padding: "4px 0",
                  ...(expanded() ? { "border-bottom": "1px solid rgba(255, 255, 255, 0.06)", "padding-bottom": "10px" } : {}),
                }}
                onClick={() => toggleProvider(provider.id)}
              >
                <div style={{ display: "flex", "align-items": "center", gap: "10px" }}>
                  <span
                    style={{
                      display: "inline-flex",
                      "align-items": "center",
                      "justify-content": "center",
                      width: "20px",
                      height: "20px",
                      color: "var(--text-subdued, #94a3b8)",
                      transform: expanded() ? "rotate(90deg)" : "rotate(0deg)",
                      transition: "transform 0.15s ease",
                      "flex-shrink": 0,
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M6 3.5a.75.75 0 0 1 1.28-.53l5 5a.75.75 0 0 1 0 1.06l-5 5A.75.75 0 0 1 6 13.5V3.5z" />
                    </svg>
                  </span>
                  <span style={{ "font-size": "14px", "font-weight": "600", color: "var(--text-default, #eceff4)" }}>
                    {provider.name}
                  </span>
                  <code style={{ "font-size": "11px", color: "var(--text-subdued, #94a3b8)", background: "rgba(255, 255, 255, 0.05)", padding: "1px 5px", "border-radius": "4px" }}>
                    {provider.id}
                  </code>
                  <span style={badgeStyle(enabled())}>
                    {enabled()
                      ? `${provider.modelCount} models${provider.discovered ? "" : ` · ${t("settings.provider.switchOnly")}`}`
                      : t("settings.provider.disabled")}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "8px", "align-items": "center" }}>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled()}
                    aria-label={t("settings.provider.toggle")}
                    title={
                      serverSupportsSwitches()
                        ? enabled()
                          ? t("settings.provider.disableHint")
                          : t("settings.provider.enableHint")
                        : t("settings.provider.toggleUnsupported")
                    }
                    disabled={busy() || !serversChecked() || !serverSupportsSwitches()}
                    onClick={(e) => {
                      e.stopPropagation()
                      void handleToggleProvider(provider.id, !enabled())
                    }}
                    style={{
                      display: "inline-flex",
                      "align-items": "center",
                      width: "34px",
                      height: "18px",
                      padding: "2px",
                      "border-radius": "9px",
                      border: "1px solid " + (enabled() ? "rgba(34, 197, 94, 0.5)" : "rgba(148, 163, 184, 0.35)"),
                      background: enabled() ? "rgba(34, 197, 94, 0.25)" : "rgba(148, 163, 184, 0.15)",
                      cursor: busy() || !serversChecked() || !serverSupportsSwitches() ? "not-allowed" : "pointer",
                      opacity: busy() ? 0.5 : 1,
                      "justify-content": enabled() ? "flex-end" : "flex-start",
                      transition: "background 0.15s ease",
                      "flex-shrink": 0,
                    }}
                  >
                    <span
                      style={{
                        width: "12px",
                        height: "12px",
                        "border-radius": "50%",
                        background: enabled() ? "#4ade80" : "#94a3b8",
                      }}
                    />
                  </button>
                  <button
                    style={{ ...buttonSecondary, "font-size": "11px", padding: "3px 8px" }}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleClearCache(provider.id)
                    }}
                  >
                    Clear Provider Cache
                  </button>
                </div>
              </div>

              {/* Model Items (Collapsible) */}
              <Show when={expanded()}>
                <div style={{ display: "flex", "flex-direction": "column", gap: "6px" }}>
                  <Show when={!provider.discovered}>
                    <div style={{ padding: "12px", color: "var(--text-subdued, #8a8a8a)", "text-align": "center", "font-size": "12px" }}>
                      {t("settings.provider.switchOnlyHint")}
                    </div>
                  </Show>
                  <Show when={provider.discovered && provider.models.length === 0}>
                    <div style={{ padding: "12px", color: "var(--text-subdued, #8a8a8a)", "text-align": "center", "font-size": "12px" }}>
                      {t("settings.provider.noModels")}
                    </div>
                  </Show>
                  <For each={provider.models}>
                    {(model) => (
                      <div
                        style={{
                          display: "flex",
                          "justify-content": "space-between",
                          "align-items": "center",
                          padding: "8px 10px",
                          background: "rgba(255, 255, 255, 0.02)",
                          border: "1px solid rgba(255, 255, 255, 0.05)",
                          "border-radius": "6px",
                        }}
                      >
                        <div style={{ display: "flex", "flex-direction": "column", gap: "3px" }}>
                          <div style={{ display: "flex", "align-items": "center", gap: "6px" }}>
                            <span style={{ "font-weight": "500", color: "var(--text-default, #eceff4)" }}>
                              {model.name}
                            </span>
                            <Show when={model.override}>
                              <span style={{ "font-size": "10px", color: "#facc15", background: "rgba(250, 204, 21, 0.15)", padding: "1px 4px", "border-radius": "3px" }}>
                                Customized
                              </span>
                            </Show>
                          </div>
                          <div style={{ display: "flex", "align-items": "center", gap: "4px" }}>
                            <code style={{ "font-size": "11px", color: "var(--text-subdued, #94a3b8)" }}>
                              {model.id}
                            </code>
                          </div>
                          <div style={{ "margin-top": "2px" }}>
                            <Show when={model.defaultValues?.limit?.context}>
                              <span style={tagStyle}>ctx: {model.defaultValues?.limit?.context.toLocaleString()}</span>
                            </Show>
                            <Show when={model.defaultValues?.capabilities?.tools}>
                              <span style={tagStyle}>tools</span>
                            </Show>
                            <Show when={model.defaultValues?.reasoning}>
                              <span style={tagStyle}>thinking</span>
                            </Show>
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: "6px", "align-items": "center" }}>
                          <button
                            style={buttonSecondary}
                            onClick={() => openEditModal(provider.id, model)}
                          >
                            Customize
                          </button>
                          <Show when={model.override}>
                            <button
                              style={buttonDanger}
                              onClick={() => handleDeleteOverride(provider.id, model.id)}
                            >
                              Reset
                            </button>
                          </Show>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          )
        }}
      </For>

      {/* Edit Override Modal Dialog */}
      <Show when={editingModel()}>
        {(target) => (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.65)",
              display: "flex",
              "justify-content": "center",
              "align-items": "center",
              "z-index": 10000,
            }}
          >
            <div
              style={{
                background: "var(--background-default, #1e1e2e)",
                border: "1px solid var(--border-default, rgba(255, 255, 255, 0.15))",
                "border-radius": "10px",
                width: "480px",
                "max-width": "90%",
                padding: "20px",
                display: "flex",
                "flex-direction": "column",
                gap: "14px",
                "box-shadow": "0 10px 30px rgba(0, 0, 0, 0.5)",
              }}
            >
              <h3 style={{ "font-size": "16px", "font-weight": "600", color: "var(--text-default, #eceff4)", margin: 0 }}>
                Customize Model
              </h3>
              <p style={{ "font-size": "12px", color: "var(--text-subdued, #94a3b8)", margin: "0 0 4px" }}>
                Override discovery defaults for <code>{target().modelID}</code> under provider <code>{target().providerID}</code>.
              </p>

              {/* Form fields */}
              <div style={{ display: "flex", "flex-direction": "column", gap: "10px" }}>
                <div>
                  <label style={{ "font-size": "11.5px", color: "var(--text-subdued, #94a3b8)", display: "block", "margin-bottom": "4px" }}>
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={editName()}
                    onInput={(e) => setEditName(e.currentTarget.value)}
                    style={{
                      width: "100%",
                      background: "rgba(0, 0, 0, 0.25)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      color: "#eceff4",
                      padding: "6px 10px",
                      "border-radius": "6px",
                      outline: "none",
                      "box-sizing": "border-box",
                    }}
                  />
                </div>

                <div style={{ display: "flex", gap: "10px" }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ "font-size": "11.5px", color: "var(--text-subdued, #94a3b8)", display: "block", "margin-bottom": "4px" }}>
                      Context Limit
                    </label>
                    <input
                      type="number"
                      value={editContext()}
                      onInput={(e) => setEditContext(e.currentTarget.value)}
                      placeholder="e.g. 1000000"
                      style={{
                        width: "100%",
                        background: "rgba(0, 0, 0, 0.25)",
                        border: "1px solid rgba(255, 255, 255, 0.15)",
                        color: "#eceff4",
                        padding: "6px 10px",
                        "border-radius": "6px",
                        outline: "none",
                        "box-sizing": "border-box",
                      }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ "font-size": "11.5px", color: "var(--text-subdued, #94a3b8)", display: "block", "margin-bottom": "4px" }}>
                      Output Limit
                    </label>
                    <input
                      type="number"
                      value={editOutput()}
                      onInput={(e) => setEditOutput(e.currentTarget.value)}
                      placeholder="e.g. 65536"
                      style={{
                        width: "100%",
                        background: "rgba(0, 0, 0, 0.25)",
                        border: "1px solid rgba(255, 255, 255, 0.15)",
                        color: "#eceff4",
                        padding: "6px 10px",
                        "border-radius": "6px",
                        outline: "none",
                        "box-sizing": "border-box",
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", gap: "20px", "margin-top": "6px" }}>
                  <label style={{ display: "flex", "align-items": "center", gap: "6px", cursor: "pointer", color: "#eceff4", "font-size": "12.5px" }}>
                    <input
                      type="checkbox"
                      checked={editTools()}
                      onChange={(e) => setEditTools(e.currentTarget.checked)}
                    />
                    Tool Calling Support
                  </label>

                  <label style={{ display: "flex", "align-items": "center", gap: "6px", cursor: "pointer", color: "#eceff4", "font-size": "12.5px" }}>
                    <input
                      type="checkbox"
                      checked={editReasoning()}
                      onChange={(e) => setEditReasoning(e.currentTarget.checked)}
                    />
                    Reasoning / Thinking
                  </label>
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: "flex", "justify-content": "flex-end", gap: "8px", "margin-top": "10px" }}>
                <button
                  style={buttonSecondary}
                  onClick={() => setEditingModel(null)}
                >
                  Cancel
                </button>
                <button
                  style={buttonPrimary}
                  onClick={handleSaveOverride}
                >
                  Save Override
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>
    </div>
  )
}
