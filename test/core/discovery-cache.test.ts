import { describe, expect, it, vi } from 'vitest'
import {
  createDiscoveryCacheEntry,
  discoveryCacheKey,
  isDiscoveryCacheFresh,
  parseDiscoveryCacheEntry,
  parseStaleDiscoveryCacheEntry,
  readDiscoveryCache,
  readStaleDiscoveryCache,
  writeDiscoveryCache,
} from '../../src/core/discovery-cache'

const identity = {
  providerID: 'local/provider',
  baseURL: 'http://127.0.0.1:1234/v1',
  endpoint: '/v1/models',
  modelInfoFormat: 'vllm',
}

describe('shared discovery cache policy', () => {
  it('creates stable provider keys', () => {
    expect(discoveryCacheKey('opencode.models-discovery.v2', identity.providerID))
      .toBe('opencode.models-discovery.v2:provider:local%2Fprovider')
  })

  it('validates identity and TTL', () => {
    const now = Date.parse('2026-10-09T00:00:00.000Z')
    const entry = createDiscoveryCacheEntry(identity, [{ id: 'qwen' }], {}, new Date(now - 1000).toISOString())

    expect(isDiscoveryCacheFresh(entry.fetchedAt, 2, now)).toBe(true)
    expect(parseDiscoveryCacheEntry(entry, identity, 2, now)).toEqual(entry)
    expect(parseDiscoveryCacheEntry(entry, { ...identity, endpoint: '/models' }, 2, now)).toBeUndefined()
    expect(parseDiscoveryCacheEntry(entry, identity, 0, now)).toBeUndefined()
  })

  it('isolates backend failures from cache policy callers', async () => {
    const backend = {
      get: vi.fn().mockRejectedValue(new Error('read failed')),
      set: vi.fn().mockRejectedValue(new Error('write failed')),
    }
    expect(await readDiscoveryCache(backend, 'key', identity, 60)).toBeUndefined()
    expect(await writeDiscoveryCache(backend, 'key', createDiscoveryCacheEntry(identity, [], {}))).toBe(false)
  })

  it('exposes expired entries only through the stale reader', async () => {
    const now = Date.parse('2026-10-09T00:00:00.000Z')
    const entry = createDiscoveryCacheEntry(identity, [{ id: 'qwen' }], {}, new Date(now - 60_000).toISOString())
    const backend = { get: vi.fn().mockResolvedValue(entry), set: vi.fn() }

    expect(parseDiscoveryCacheEntry(entry, identity, 1, now)).toBeUndefined()
    expect(parseStaleDiscoveryCacheEntry(entry, identity)).toEqual(entry)
    expect(await readDiscoveryCache(backend, 'key', identity, 1)).toBeUndefined()
    expect(await readStaleDiscoveryCache(backend, 'key', identity)).toEqual(entry)
  })

  it('rejects stale entries whose identity no longer matches', async () => {
    const entry = createDiscoveryCacheEntry(identity, [{ id: 'qwen' }], {})
    const backend = { get: vi.fn().mockResolvedValue(entry), set: vi.fn() }

    expect(parseStaleDiscoveryCacheEntry(entry, { ...identity, baseURL: 'http://127.0.0.1:9999/v1' })).toBeUndefined()
    expect(await readStaleDiscoveryCache(backend, 'key', { ...identity, providerID: 'other' })).toBeUndefined()
  })
})
