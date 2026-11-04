import { For, Show, createSignal, onMount } from "solid-js"
import { DiscoveryRpcDefinition, type RpcModelOverride, type RpcStatusOutput } from "./v2/rpc.js"

interface Props {
  readonly client: any
  readonly toast?: {
    show(options: { title: string; message: string; variant?: "info" | "success" | "warning" | "error" }): void
  }
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
  const [loading, setLoading] = createSignal(false)
  const [refreshing, setRefreshing] = createSignal(false)
  const [statusData, setStatusData] = createSignal<RpcStatusOutput | null>(null)
  const [search, setSearch] = createSignal("")
  const [selectedProvider, setSelectedProvider] = createSignal<string>("all")
  const [editingModel, setEditingModel] = createSignal<{
    providerID: string
    modelID: string
    currentName: string
    override?: RpcModelOverride
  } | null>(null)

  // Edit form state
  const [editName, setEditName] = createSignal("")
  const [editContext, setEditContext] = createSignal<string>("")
  const [editOutput, setEditOutput] = createSignal<string>("")
  const [editTools, setEditTools] = createSignal<boolean>(true)
  const [editReasoning, setEditReasoning] = createSignal<boolean>(false)

  const rpc = () => props.client?.rpc ? props.client.rpc(DiscoveryRpcDefinition) : null

  const fetchStatus = async () => {
    const client = rpc()
    if (!client) return
    setLoading(true)
    try {
      const data = await client.status({ details: true, rawCache: true })
      setStatusData(data)
    } catch (e: any) {
      props.toast?.show({
        title: "Model Discovery",
        message: e?.message || "Failed to load discovery status",
        variant: "error",
      })
    } finally {
      setLoading(false)
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
    void fetchStatus()
  })

  const filteredProviders = () => {
    const data = statusData()
    if (!data) return []
    const provFilter = selectedProvider()
    const q = search().toLowerCase().trim()

    return data.providers
      .filter((p) => provFilter === "all" || p.id === provFilter)
      .map((p) => {
        if (!q) return p
        const matchedModels = p.models.filter(
          (m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)
        )
        return { ...p, models: matchedModels }
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
          <h2 style={{ "font-size": "18px", "font-weight": "600", "margin-bottom": "4px", color: "var(--text-default, #eceff4)" }}>
            OpenAI-Compatible Model Discovery
          </h2>
          <p style={{ "font-size": "12.5px", color: "var(--text-subdued, #94a3b8)", margin: "0" }}>
            Dynamic model catalog sync for OpenAI-compatible providers, gateways, and local backends.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            style={buttonSecondary}
            onClick={() => handleClearCache()}
            disabled={refreshing() || loading()}
          >
            Clear Cache
          </button>
          <button
            style={buttonPrimary}
            onClick={() => handleRefresh(true)}
            disabled={refreshing() || loading()}
          >
            {refreshing() ? "Refreshing..." : "Force Refresh"}
          </button>
        </div>
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
              {statusData()?.providers.length ?? 0} providers
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
          <For each={statusData()?.providers ?? []}>
            {(p) => <option value={p.id}>{p.name} ({p.modelCount})</option>}
          </For>
        </select>
      </div>

      {/* Provider & Model Lists */}
      <For each={filteredProviders()}>
        {(provider) => (
          <div style={cardStyle}>
            {/* Provider Header */}
            <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", "border-bottom": "1px solid rgba(255, 255, 255, 0.06)", "padding-bottom": "8px" }}>
              <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
                <span style={{ "font-size": "14px", "font-weight": "600", color: "var(--text-default, #eceff4)" }}>
                  {provider.name}
                </span>
                <code style={{ "font-size": "11px", color: "var(--text-subdued, #94a3b8)", background: "rgba(255, 255, 255, 0.05)", padding: "1px 5px", "border-radius": "4px" }}>
                  {provider.id}
                </code>
                <span style={badgeStyle(true)}>
                  {provider.models.length} models
                </span>
              </div>
              <button
                style={{ ...buttonSecondary, "font-size": "11px", padding: "3px 8px" }}
                onClick={() => handleClearCache(provider.id)}
              >
                Clear Provider Cache
              </button>
            </div>

            {/* Model Items */}
            <div style={{ display: "flex", "flex-direction": "column", gap: "6px" }}>
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
          </div>
        )}
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
