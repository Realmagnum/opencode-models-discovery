import { Plugin, SettingsPage } from "@opencode/plugin/gui"
import { SettingsView } from "./gui-view"

export default Plugin.define({
  setup(ctx) {
    ctx.add(SettingsPage, () => ({
      id: "models-discovery",
      icon: "models" as const,
      title: "Model Discovery",
      render: () => (
        <SettingsView
          client={ctx.client}
          toast={{
            show: (opts) => {
              ctx.toast.show({
                title: opts.title,
                description: opts.message,
                variant: opts.variant === "error" ? "error" : opts.variant === "success" ? "success" : "default",
              })
            },
          }}
        />
      ),
    }))
  },
})

