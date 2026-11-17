export type SupportedLocale = "en" | "ru"

export type TranslationParams = Record<string, string | number | boolean>

export const I18N_EN = {
  // Navigation & Header
  "settings.navTitle": "Model Discovery",
  "settings.header.title": "OpenAI-Compatible Model Discovery",
  "settings.header.desc": "Dynamic model catalog sync for OpenAI-compatible providers, gateways, and local backends.",

  // Servers
  "settings.server": "Server",
  "settings.servers.refresh": "Find servers",
  "settings.servers.thisMachine": "This machine",
  "settings.servers.switchUnsupported": "Provider switches need a newer opencode-models-discovery build on this server.",
  "settings.servers.localHint": "Installed from a local directory ({{path}}); update it on that machine.",
  "settings.servers.update": "Update plugin",
  "settings.servers.updating": "Updating…",
  "settings.servers.updateTitle": "Plugin Update",
  "settings.servers.updateHint": "Update opencode-models-discovery on this server and reload it",

  // Action Buttons
  "settings.action.clearCache": "Clear Cache",
  "settings.action.refresh": "Refresh Catalog",
  "settings.action.refreshing": "Refreshing…",
  "settings.action.save": "Save Override",
  "settings.action.cancel": "Cancel",
  "settings.action.reset": "Reset to Defaults",
  "settings.action.edit": "Edit",
  "settings.action.customized": "Customized",
  "settings.action.expandAll": "Expand All",
  "settings.action.collapseAll": "Collapse All",

  // Summary Metrics
  "settings.summary.totalModels": "Total Models",
  "settings.summary.providers": "Providers",
  "settings.summary.activeOverrides": "Active Overrides",
  "settings.summary.cached": "Cached in Storage",

  // Filters & Search
  "settings.filter.searchPlaceholder": "Search models by id or name…",
  "settings.filter.allProviders": "All Providers",

  // Providers & Models
  "settings.provider.noModels": "No matching models found.",
  "settings.provider.switchOnly": "switch only",
  "settings.provider.switchOnlyHint": "OpenCode manages this provider's catalog; the switch controls whether its models appear in the model picker.",
  "settings.provider.disabled": "disabled",
  "settings.provider.toggle": "Provider availability",
  "settings.provider.enableHint": "Enable this provider and its models",
  "settings.provider.disableHint": "Disable this provider without removing its configuration",
  "settings.provider.toggleUnsupported": "Provider switches are unavailable on this server",
  "settings.model.context": "Context",
  "settings.model.output": "Output",
  "settings.model.tools": "Tools",
  "settings.model.reasoning": "Reasoning",
  "settings.model.yes": "yes",
  "settings.model.no": "no",

  // Overrides modal / form
  "settings.edit.title": "Override Model Configuration",
  "settings.edit.displayName": "Display Name",
  "settings.edit.contextLimit": "Context Limit (tokens)",
  "settings.edit.outputLimit": "Max Output Limit (tokens)",
  "settings.edit.enableTools": "Support Function / Tool Calling",
  "settings.edit.enableReasoning": "Model supports reasoning (Thinking / CoT)",

  // Toasts & Alerts
  "toast.loadFailed": "Failed to load discovery status",
  "toast.refreshedTitle": "Discovery Refreshed",
  "toast.refreshedMsg": "Discovered {{models}} models across {{providers}} providers.",
  "toast.cacheClearedTitle": "Storage Cache Cleared",
  "toast.cacheClearedMsg": "Cleared discovery storage and in-memory cache.",
  "toast.overrideSaved": "Updated overrides for {{model}}",
  "toast.overrideReset": "Reset overrides for {{model}}",
  "toast.providerSwitchTitle": "Provider Switch",
  "toast.providerEnabled": "{{provider}} is available again.",
  "toast.providerDisabled": "{{provider}} is disabled; its configuration is kept.",
  "toast.providerSwitchFailed": "Failed to change provider availability",
  "toast.providerSwitchUnsupported": "This server runs an older plugin build; update opencode-models-discovery there.",
  "toast.pluginUpdated": "opencode-models-discovery was updated on {{server}}.",
  "toast.pluginUpdatedReload": "The plugin was updated on {{server}}, but it has not reconnected yet. Reload the server if provider switches stay unavailable.",
  "toast.pluginUpdateFailed": "The plugin update failed on this server.",
  "toast.pluginUpdateLocal": "This server loads the plugin from a local directory ({{path}}); update and rebuild it on that machine.",

  "gear.title": "Open Model Discovery settings",
}

export type I18nKey = keyof typeof I18N_EN

export const I18N_RU: Record<I18nKey, string> = {
  // Navigation & Header
  "settings.navTitle": "Обнаружение моделей",
  "settings.header.title": "Автообнаружение моделей OpenAI-совместимых провайдеров",
  "settings.header.desc": "Динамическая синхронизация каталога моделей для OpenAI-совместимых шлюзов, провайдеров и локальных бэкендов.",

  // Servers
  "settings.server": "Сервер",
  "settings.servers.refresh": "Найти серверы",
  "settings.servers.thisMachine": "Этот компьютер",
  "settings.servers.switchUnsupported": "Для переключения провайдеров нужна более новая сборка opencode-models-discovery на этом сервере.",
  "settings.servers.localHint": "Установлен из локального каталога ({{path}}); обновите его на той машине.",
  "settings.servers.update": "Обновить плагин",
  "settings.servers.updating": "Обновление…",
  "settings.servers.updateTitle": "Обновление плагина",
  "settings.servers.updateHint": "Обновить opencode-models-discovery на этом сервере и перезагрузить его",

  // Action Buttons
  "settings.action.clearCache": "Очистить кэш",
  "settings.action.refresh": "Обновить каталог",
  "settings.action.refreshing": "Обновление…",
  "settings.action.save": "Сохранить параметры",
  "settings.action.cancel": "Отмена",
  "settings.action.reset": "Сбросить параметры",
  "settings.action.edit": "Изменить",
  "settings.action.customized": "Настроено",
  "settings.action.expandAll": "Развернуть все",
  "settings.action.collapseAll": "Свернуть все",

  // Summary Metrics
  "settings.summary.totalModels": "Всего моделей",
  "settings.summary.providers": "Провайдеров",
  "settings.summary.activeOverrides": "Активных переопределений",
  "settings.summary.cached": "В кэше хранилища",

  // Filters & Search
  "settings.filter.searchPlaceholder": "Поиск моделей по ID или названию…",
  "settings.filter.allProviders": "Все провайдеры",

  // Providers & Models
  "settings.provider.noModels": "Подходящие модели не найдены.",
  "settings.provider.switchOnly": "только переключатель",
  "settings.provider.switchOnlyHint": "Каталогом этого провайдера управляет OpenCode; переключатель определяет, показывать ли его модели в выборе моделей.",
  "settings.provider.disabled": "выключен",
  "settings.provider.toggle": "Доступность провайдера",
  "settings.provider.enableHint": "Включить провайдера и его модели",
  "settings.provider.disableHint": "Выключить провайдера, сохранив его настройки",
  "settings.provider.toggleUnsupported": "Переключение провайдеров недоступно на этом сервере",
  "settings.model.context": "Контекст",
  "settings.model.output": "Вывод",
  "settings.model.tools": "Инструменты",
  "settings.model.reasoning": "Рассуждения",
  "settings.model.yes": "да",
  "settings.model.no": "нет",

  // Overrides modal / form
  "settings.edit.title": "Переопределение параметров модели",
  "settings.edit.displayName": "Отображаемое имя",
  "settings.edit.contextLimit": "Лимит контекста (токенов)",
  "settings.edit.outputLimit": "Максимальный вывод (токенов)",
  "settings.edit.enableTools": "Поддержка вызова функций (Tools)",
  "settings.edit.enableReasoning": "Поддержка режима рассуждений (Thinking / CoT)",

  // Toasts & Alerts
  "toast.loadFailed": "Не удалось загрузить статус обнаружения",
  "toast.refreshedTitle": "Каталог обновлён",
  "toast.refreshedMsg": "Обнаружено моделей: {{models}} у провайдеров: {{providers}}.",
  "toast.cacheClearedTitle": "Кэш хранилища очищен",
  "toast.cacheClearedMsg": "Кэш хранилища и оперативной памяти очищен.",
  "toast.overrideSaved": "Параметры обновлены для {{model}}",
  "toast.overrideReset": "Сброшены параметры для {{model}}",
  "toast.providerSwitchTitle": "Провайдер",
  "toast.providerEnabled": "{{provider}} снова доступен.",
  "toast.providerDisabled": "{{provider}} выключен; настройки сохранены.",
  "toast.providerSwitchFailed": "Не удалось изменить доступность провайдера",
  "toast.providerSwitchUnsupported": "На этом сервере старая сборка плагина; обновите opencode-models-discovery.",
  "toast.pluginUpdated": "opencode-models-discovery обновлён на сервере {{server}}.",
  "toast.pluginUpdatedReload": "Плагин обновлён на сервере {{server}}, но ещё не переподключился. Перезагрузите сервер, если переключатели недоступны.",
  "toast.pluginUpdateFailed": "Не удалось обновить плагин на этом сервере.",
  "toast.pluginUpdateLocal": "На этом сервере плагин загружается из локального каталога ({{path}}); обновите и пересоберите его на той машине.",

  "gear.title": "Открыть настройки обнаружения моделей",
}

export const I18N_CATALOG: { readonly en: Record<string, string>; [locale: string]: Record<string, string> } = {
  en: I18N_EN,
  "en-us": I18N_EN,
  "en-gb": I18N_EN,
  ru: I18N_RU,
  "ru-ru": I18N_RU,
}

export function resolveTranslation(
  locale: string | undefined,
  key: string,
  params?: TranslationParams
): string {
  const norm = (locale || "").toLowerCase().replace("_", "-")
  const lang = norm.split("-")[0] || "en"

  const dict = I18N_CATALOG[norm] || I18N_CATALOG[lang] || I18N_EN
  const template = dict[key] ?? I18N_EN[key as I18nKey] ?? key

  if (!params) return template

  return template.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (_: string, p: string) => {
    return params[p] !== undefined ? String(params[p]) : `{{${p}}}`
  })
}
