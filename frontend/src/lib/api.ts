const BASE = '/api/v1'

export async function fetchIocs(params: Record<string, string | number>) {
  const q = new URLSearchParams(Object.entries(params).map(([k,v])=>[k,String(v)]))
  const r = await fetch(`${BASE}/iocs?${q}`)
  if (!r.ok) throw new Error('API error')
  return r.json()
}

export async function fetchSources() {
  const r = await fetch(`${BASE}/sources`)
  return r.json()
}

export async function triggerFetch(sourceId: string) {
  return fetch(`${BASE}/sources/${sourceId}/fetch`, { method: 'POST' })
}

export async function exportFlat(params: Record<string, string>) {
  const q = new URLSearchParams(params)
  const r = await fetch(`${BASE}/export/flat?${q}`)
  return r.text()
}
