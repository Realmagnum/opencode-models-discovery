/**
 * Resolves a models discovery endpoint against a provider base URL.
 *
 * If endpoint starts with "/", it is resolved against the provider origin
 * (preserving explicit root-level overrides like "/models" or "/v1/models").
 * Otherwise (or if relative), it is resolved relative to the provider's baseURL,
 * preserving sub-paths such as "https://example.com/v1/free/".
 * If baseURL has a subpath and the endpoint is the default "/v1/models",
 * it smartly appends "/models" to the subpath if the baseURL already ends with a path like "/v1/free".
 */
export function buildDiscoveryURL(baseURL: string, endpoint: string): string {
  if (/^https?:\/\//i.test(endpoint)) {
    return endpoint
  }

  // If endpoint is explicitly specified as origin-relative
  if (endpoint.startsWith('/')) {
    // If the user specified a custom endpoint (not the generic "/v1/models"), respect origin resolution
    if (endpoint !== '/v1/models') {
      return new URL(endpoint, new URL(baseURL).origin).toString()
    }

    // Default "/v1/models": check if baseURL already contains a subpath starting with /v1/ (like /v1/free)
    try {
      const baseObj = new URL(baseURL)
      const pathname = baseObj.pathname.replace(/\/+$/, '')
      if (pathname.startsWith('/v1/') && pathname !== '/v1') {
        // e.g. /v1/free -> /v1/free/models
        return new URL(`${pathname}/models`, baseObj.origin).toString()
      }
    } catch {
      // Invalid URL falls through to origin resolution
    }

    return new URL(endpoint, new URL(baseURL).origin).toString()
  }

  return new URL(endpoint, baseURL.endsWith('/') ? baseURL : `${baseURL}/`).toString()
}

/**
 * Resolves a model-info endpoint against a provider base URL.
 *
 * Absolute URLs are returned unchanged. Endpoints starting with "/" are
 * resolved against the provider origin, which is the common case for native
 * endpoints such as Ollama's /api/show. Other relative paths are resolved
 * against the provider base URL.
 */
export function buildModelInfoURL(baseURL: string, endpoint: string): string {
  if (/^https?:\/\//i.test(endpoint)) {
    return endpoint
  }
  return endpoint.startsWith('/')
    ? new URL(endpoint, new URL(baseURL).origin).toString()
    : new URL(endpoint, baseURL.endsWith('/') ? baseURL : `${baseURL}/`).toString()
}
