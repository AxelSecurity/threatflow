const BASE = '/api/v1'

function getToken() {
  return localStorage.getItem('tf_token')
}

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = getToken()
  const r = await fetch(BASE + path, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...opts,
  })
  if (!r.ok) throw new Error(`API ${r.status}: ${await r.text()}`)
  if (r.status === 204) return null as T
  return r.json()
}

export interface Ioc {
  id: string; ioc_type: string; value: string; tlp: string
  score: number; status: string; ttl_days: number | null
  first_seen: string | null; last_seen: string | null
  expires_at: string | null; created_at: string
  sources: string[]; tags: string[]
}

export interface IocList {
  total: number; page: number; size: number; items: Ioc[]
}

export interface Source {
  id: string; name: string; feed_type: string; url: string | null
  active: boolean; fetch_interval: number; last_fetched: string | null; created_at: string
}

export interface Flow {
  id: string; name: string; active: boolean; definition: object; created_at: string
}

export const api = {
  iocs: {
    list: (p: Record<string, string | number>) =>
      req<IocList>(`/iocs?${new URLSearchParams(Object.entries(p).map(([k,v])=>[k,String(v)])
        .filter(([,v])=>v!==''))}`),
    get:  (id: string)          => req<Ioc>(`/iocs/${id}`),
    create: (body: object)      => req<Ioc>('/iocs', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, b: object) => req<Ioc>(`/iocs/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
    delete: (id: string)        => req<null>(`/iocs/${id}`, { method: 'DELETE' }),
  },
  sources: {
    list:   ()                  => req<Source[]>('/sources'),
    create: (body: object)      => req<Source>('/sources', { method: 'POST', body: JSON.stringify(body) }),
    fetch:  (id: string)        => req<object>(`/sources/${id}/fetch`, { method: 'POST' }),
    toggle: (id: string)        => req<object>(`/sources/${id}/toggle`, { method: 'PATCH' }),
    delete: (id: string)        => req<null>(`/sources/${id}`, { method: 'DELETE' }),
  },
  flows: {
    list:       ()              => req<Flow[]>('/flows'),
    create:     (body: object)  => req<Flow>('/flows', { method: 'POST', body: JSON.stringify(body) }),
    activate:   (id: string)    => req<object>(`/flows/${id}/activate`, { method: 'POST' }),
    deactivate: (id: string)    => req<object>(`/flows/${id}/deactivate`, { method: 'POST' }),
    delete:     (id: string)    => req<null>(`/flows/${id}`, { method: 'DELETE' }),
  },
  export: {
    flat: (params: Record<string,string>) =>
      fetch(`${BASE}/export/flat?${new URLSearchParams(params)}`).then(r => r.text()),
  },
}
