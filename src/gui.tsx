import { Plugin, SettingsPage, Style } from "@opencode/plugin/gui"
import { SettingsView } from "./gui-view"
import { I18N_CATALOG } from "./i18n"

const PLUGIN_GUI_STYLES = `
/* Distinct highlight for plugin navigation item in Settings sidebar */
.settings-nav-groups [data-slot="tabs-v2-trigger-wrapper"][data-value="models-discovery"] [data-slot="tabs-v2-trigger"] svg {
  color: #9d7cd8 !important;
}
`

export default Plugin.define({
  i18n: I18N_CATALOG,
  setup(ctx) {
    ctx.add(Style, PLUGIN_GUI_STYLES)

    ctx.add(SettingsPage, () => ({
      id: "models-discovery",
      icon: "models" as const,
      title: ctx.t("settings.navTitle"),
      render: () => (
        <SettingsView
          client={() => ctx.client}
          servers={ctx.servers}
          t={(k, p) => ctx.t(k, p)}
          locale={() => ctx.locale.locale()}
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
