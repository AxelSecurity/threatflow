import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useSource, useSourceLogs, useSourceIocs, useToggleSource } from '../hooks/useIocs'
import { api } from '../lib/api'

type Tab = 'config' | 'logs' | 'iocs'

const FEED_COLOR: Record<string, string> = {
  http_feed: '#4488ff',
  taxii_in:  '#a855f7',
  misp_in:   '#00f090',
  manual_in: '#ffaa20',
}

const LEVEL_STYLE: Record<string, { bg: string; color: string }> = {
  INFO:    { bg: 'rgba(0,212,255,.08)',  color: 'var(--cyan)'  },
  WARNING: { bg: 'rgba(255,170,32,.10)', color: 'var(--amber)' },
  ERROR:   { bg: 'rgba(255,51,85,.10)',  color: 'var(--red)'   },
}

function relTime(iso: string | null) {
  if (!iso) return 'mai'
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.round(diff / 1000)
  if (s < 60)   return `${s}s fa`
  const m = Math.round(s / 60)
  if (m < 60)   return `${m}m fa`
  const h = Math.round(m / 60)
  if (h < 24)   return `${h}h fa`
  return `${Math.floor(h / 24)}g fa`
}

function fmtDatetime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function fmtInterval(secs: number) {
  if (secs < 60)   return `${secs}s`
  if (secs < 3600) return `${Math.round(secs / 60)}m`
  return `${Math.round(secs / 3600)}h`
}

const scoreColor = (s: number) =>
  s >= 75 ? 'var(--red)' : s >= 50 ? 'var(--amber)' : s >= 25 ? 'var(--cyan)' : 'var(--t3)'

export default function SourceDetail() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate    = useNavigate()
  const qc          = useQueryClient()

  const [tab, setTab]           = useState<Tab>('config')
  const [iocPage, setIocPage]   = useState(1)
  const [fetchingId, setFetching] = useState(false)
  const [fetchOk, setFetchOk]   = useState(false)

  const { data: src, isLoading } = useSource(id)
  const { data: logs = [] }      = useSourceLogs(id)
  const { data: iocData }        = useSourceIocs(id, iocPage, 50)
  const toggleMut                = useToggleSource()

  const [newIoc, setNewIoc] = useState({ value: '', ioc_type: '', tlp: 'amber', score: 50 })
  const [isSaving, setIsSaving] = useState(false)

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 48px)', fontFamily: 'var(--mono)', color: 'var(--t3)' }}>
        caricamento...
      </div>
    )
  }
  if (!src) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 48px)', fontFamily: 'var(--mono)', color: 'var(--red)' }}>
        sorgente non trovata
      </div>
    )
  }

  const col = FEED_COLOR[src.feed_type] ?? '#4a7090'

  async function handleFetch() {
    setFetching(true)
    try {
      await api.sources.fetch(id)
      setFetchOk(true)
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['sources', id] })
        qc.invalidateQueries({ queryKey: ['source-logs', id] })
        qc.invalidateQueries({ queryKey: ['source-iocs', id] })
        qc.invalidateQueries({ queryKey: ['sources'] })
        qc.invalidateQueries({ queryKey: ['iocs'] })
        setFetchOk(false)
      }, 4000)
    } finally {
      setFetching(false)
    }
  }

  async function updateManualIndicators(indicators: any[]) {
    if (!src) return
    setIsSaving(true)
    try {
      await api.sources.updateConfig(id, { ...(src.config as any), indicators })
      qc.invalidateQueries({ queryKey: ['sources', id] })
    } finally {
      setIsSaving(false)
    }
  }

  function addManualIndicator() {
    if (!src || !newIoc.value.trim()) return
    const indicators = [...((src.config as any).indicators || []), { ...newIoc, value: newIoc.value.trim() }]
    updateManualIndicators(indicators)
    setNewIoc({ value: '', ioc_type: '', tlp: 'amber', score: 50 })
  }

  function removeManualIndicator(index: number) {
    if (!src) return
    const indicators = [...((src.config as any).indicators || [])]
    indicators.splice(index, 1)
    updateManualIndicators(indicators)
  }

  const tabBtn = (t: Tab, label: string, count?: number) => (
    <button
      onClick={() => setTab(t)}
      style={{
        background: tab === t ? 'var(--bg3)' : 'transparent',
        border: 'none',
        borderBottom: `2px solid ${tab === t ? 'var(--cyan)' : 'transparent'}`,
        padding: '10px 18px',
        fontFamily: 'var(--mono)',
        fontSize: 11,
        color: tab === t ? 'var(--t0)' : 'var(--t2)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {label}
      {count !== undefined && (
        <span style={{
          background: tab === t ? 'var(--cyanx)' : 'var(--bg3)',
          color: tab === t ? 'var(--cyan)' : 'var(--t3)',
          border: `1px solid ${tab === t ? 'rgba(0,212,255,.2)' : 'var(--bd1)'}`,
          borderRadius: 10, padding: '1px 7px', fontSize: 9,
        }}>
          {count}
        </span>
      )}
    </button>
  )

  return (
    <div style={{ minHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column' }}>

      {/* BREADCRUMB + HEADER */}
      <div style={{ background: 'var(--bg1)', borderBottom: '1px solid var(--bd1)', padding: '12px 20px' }}>
        {/* Breadcrumb */}
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => navigate('/sources')}
            style={{ background: 'none', border: 'none', color: 'var(--t3)', fontFamily: 'var(--mono)', fontSize: 10, cursor: 'pointer', padding: 0, letterSpacing: '.04em' }}
          >
            ← sorgenti
          </button>
          <span style={{ color: 'var(--t3)', fontSize: 10 }}>/</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t1)' }}>{src.name}</span>
        </div>

        {/* Main header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ width: 4, height: 36, borderRadius: 2, background: col, flexShrink: 0 }} />
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 700, color: 'var(--t0)', lineHeight: 1 }}>
              {src.name}
            </div>
            <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700,
                padding: '2px 8px', borderRadius: 2, letterSpacing: '.05em',
                background: `${col}18`, color: col, borderLeft: `2px solid ${col}`,
              }}>
                {src.feed_type}
              </span>
              <span style={{
                fontFamily: 'var(--mono)', fontSize: 9, padding: '2px 8px', borderRadius: 2,
                background: src.active ? 'var(--greenx)' : 'var(--bg3)',
                color: src.active ? 'var(--green)' : 'var(--t3)',
                border: `1px solid ${src.active ? 'var(--green2)' : 'var(--bd2)'}`,
              }}>
                {src.active ? '● attiva' : '○ inattiva'}
              </span>
            </div>
          </div>

          {/* Stats */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: 'var(--cyan)' }}>
                {src.ioc_count}
              </div>
              <div style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.08em' }}>IOC</div>
            </div>
            <div style={{ width: 1, height: 32, background: 'var(--bd1)' }} />
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t1)' }}>
                {relTime(src.last_fetched)}
              </div>
              <div style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.08em' }}>ultimo fetch</div>
            </div>
            <div style={{ width: 1, height: 32, background: 'var(--bd1)' }} />
            {/* Toggle active */}
            <button
              onClick={() => { toggleMut.mutate(id); qc.invalidateQueries({ queryKey: ['sources', id] }) }}
              disabled={toggleMut.isPending}
              style={{
                background: src.active ? 'var(--greenx)' : 'var(--bg3)',
                border: `1px solid ${src.active ? 'var(--green2)' : 'var(--bd2)'}`,
                borderRadius: 3, padding: '6px 14px',
                fontFamily: 'var(--mono)', fontSize: 10,
                color: src.active ? 'var(--green)' : 'var(--t3)',
                cursor: toggleMut.isPending ? 'default' : 'pointer',
              }}
            >
              {src.active ? 'disattiva' : 'attiva'}
            </button>
            {/* Fetch button */}
            <button
              onClick={handleFetch}
              disabled={fetchingId || fetchOk}
              style={{
                background: fetchOk ? 'var(--greenx)' : 'var(--cyanx)',
                border: `1px solid ${fetchOk ? 'var(--green2)' : 'rgba(0,212,255,.25)'}`,
                borderRadius: 3, padding: '6px 14px', minWidth: 90,
                fontFamily: 'var(--mono)', fontSize: 10,
                color: fetchOk ? 'var(--green)' : 'var(--cyan)',
                cursor: fetchingId || fetchOk ? 'default' : 'pointer',
                opacity: fetchingId ? 0.5 : 1,
              }}
            >
              {fetchingId ? '⟳ fetch…' : fetchOk ? '✓ avviato' : '⟳ fetch'}
            </button>
          </div>
        </div>
      </div>

      {/* TAB BAR */}
      <div style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--bd1)', display: 'flex', gap: 0 }}>
        {tabBtn('config', 'Configurazione')}
        {tabBtn('logs',   'Log connettore', src.log_count)}
        {tabBtn('iocs',   'IOC recuperati', src.ioc_count)}
      </div>

      {/* TAB CONTENT */}
      <div style={{ flex: 1, overflow: 'auto' }}>

        {/* ── CONFIG ── */}
        {tab === 'config' && (
          <div style={{ padding: 24, maxWidth: 720 }}>
            <div style={{ display: 'grid', rowGap: 0 }}>
              {([
                ['Nome',        src.name],
                ['Tipo feed',   src.feed_type],
                ['URL',         src.url || '—'],
                ['Intervallo',  fmtInterval(src.fetch_interval)],
                ['Stato',       src.active ? 'Attiva' : 'Inattiva'],
                ['Creata il',   fmtDatetime(src.created_at)],
                ['Ultimo fetch',fmtDatetime(src.last_fetched)],
              ] as [string, string][]).map(([label, val]) => (
                <div key={label} style={{ display: 'flex', borderBottom: '1px solid var(--bd1)', padding: '10px 0' }}>
                  <div style={{ width: 160, flexShrink: 0, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.08em', paddingTop: 1 }}>
                    {label}
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t1)', wordBreak: 'break-all' }}>
                    {val}
                  </div>
                </div>
              ))}
            </div>

            {/* Manual Indicators Manager */}
            {src.feed_type === 'manual_in' && (
              <div style={{ marginTop: 32, paddingTop: 32, borderTop: '1px solid var(--bd1)' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: 'var(--t0)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 16 }}>
                  Indicatori Manuali
                </div>

                {/* Form di aggiunta */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 100px 80px auto', gap: 10, alignItems: 'end', background: 'rgba(255,170,32,.03)', padding: 14, borderRadius: 6, border: '1px solid rgba(255,170,32,.1)', marginBottom: 20 }}>
                  <div>
                    <div style={{ fontSize: 9, color: 'var(--t2)', textTransform: 'uppercase', marginBottom: 4 }}>Valore</div>
                    <input 
                      value={newIoc.value} 
                      onChange={e => setNewIoc(v => ({...v, value: e.target.value}))}
                      placeholder="es. 1.2.3.4"
                      style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--bd2)', borderRadius: 3, padding: '7px 10px', color: 'var(--t0)', fontSize: 11 }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: 'var(--t2)', textTransform: 'uppercase', marginBottom: 4 }}>Tipo (opz)</div>
                    <select 
                      value={newIoc.ioc_type} 
                      onChange={e => setNewIoc(v => ({...v, ioc_type: e.target.value}))}
                      style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--bd2)', borderRadius: 3, padding: '7px 10px', color: 'var(--t0)', fontSize: 11 }}
                    >
                      <option value="">Auto</option>
                      <option value="ipv4">IPv4</option>
                      <option value="ipv6">IPv6</option>
                      <option value="domain">Domain</option>
                      <option value="url">URL</option>
                      <option value="md5">MD5</option>
                      <option value="sha1">SHA1</option>
                      <option value="sha256">SHA256</option>
                      <option value="sha512">SHA512</option>
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: 'var(--t2)', textTransform: 'uppercase', marginBottom: 4 }}>TLP</div>
                    <select 
                      value={newIoc.tlp} 
                      onChange={e => setNewIoc(v => ({...v, tlp: e.target.value}))}
                      style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--bd2)', borderRadius: 3, padding: '7px 10px', color: 'var(--t0)', fontSize: 11 }}
                    >
                      <option value="white">WHITE</option>
                      <option value="green">GREEN</option>
                      <option value="amber">AMBER</option>
                      <option value="red">RED</option>
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: 'var(--t2)', textTransform: 'uppercase', marginBottom: 4 }}>Score</div>
                    <input 
                      type="number" min={0} max={100}
                      value={newIoc.score} 
                      onChange={e => setNewIoc(v => ({...v, score: Number(e.target.value)}))}
                      style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--bd2)', borderRadius: 3, padding: '7px 10px', color: 'var(--t0)', fontSize: 11 }}
                    />
                  </div>
                  <button 
                    onClick={addManualIndicator}
                    disabled={isSaving || !newIoc.value.trim()}
                    style={{ background: 'var(--amber)', border: 'none', borderRadius: 3, padding: '8px 16px', color: '#000', fontWeight: 600, fontSize: 10, cursor: 'pointer', opacity: (isSaving || !newIoc.value.trim()) ? 0.5 : 1 }}
                  >
                    AGGIUNGI
                  </button>
                </div>

                {/* Lista attuale */}
                <div style={{ border: '1px solid var(--bd1)', borderRadius: 6, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--bd1)' }}>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 9, color: 'var(--t2)', textTransform: 'uppercase' }}>Valore</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 9, color: 'var(--t2)', textTransform: 'uppercase' }}>Metadati</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 9, color: 'var(--t2)', textTransform: 'uppercase' }}>Azioni</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(!(src.config as any).indicators || (src.config as any).indicators.length === 0) ? (
                        <tr>
                          <td colSpan={3} style={{ padding: 20, textAlign: 'center', fontSize: 10, color: 'var(--t3)', fontFamily: 'var(--mono)' }}>Nessun indicatore manuale</td>
                        </tr>
                      ) : (src.config as any).indicators.map((ioc: any, idx: number) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--bd1)' }}>
                          <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t1)' }}>{ioc.value}</td>
                          <td style={{ padding: '8px 12px' }}>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <span style={{ fontSize: 9, background: 'var(--bg3)', padding: '2px 6px', borderRadius: 2, color: 'var(--t2)' }}>{ioc.ioc_type || 'auto'}</span>
                              <span style={{ fontSize: 9, background: 'var(--bg3)', padding: '2px 6px', borderRadius: 2, color: ioc.tlp === 'red' ? 'var(--red)' : ioc.tlp === 'amber' ? 'var(--amber)' : 'var(--green)' }}>TLP:{ioc.tlp.toUpperCase()}</span>
                              <span style={{ fontSize: 9, background: 'var(--bg3)', padding: '2px 6px', borderRadius: 2, color: 'var(--cyan)' }}>Score:{ioc.score}</span>
                            </div>
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            <button 
                              onClick={() => removeManualIndicator(idx)}
                              disabled={isSaving}
                              style={{ background: 'transparent', border: '1px solid var(--red)', color: 'var(--red)', borderRadius: 2, padding: '2px 8px', fontSize: 9, cursor: 'pointer' }}
                            >
                              rimuovi
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: 12, fontSize: 10, color: 'var(--t3)', fontStyle: 'italic' }}>
                  Nota: Dopo aver aggiunto o rimosso indicatori, clicca su "Fetch" in alto per aggiornare gli IOC attivi.
                </div>
              </div>
            )}

            {/* Config JSON extra (solo se non manuale o per debug) */}
            {(src.feed_type !== 'manual_in' && Object.keys(src.config).length > 0) && (
              <div style={{ marginTop: 24 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 8 }}>
                  config avanzata
                </div>
                <pre style={{
                  background: 'var(--bg2)', border: '1px solid var(--bd2)',
                  borderRadius: 4, padding: 14, margin: 0,
                  fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t1)',
                  overflowX: 'auto',
                }}>
                  {JSON.stringify(src.config, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* ── LOGS ── */}
        {tab === 'logs' && (
          <div>
            {logs.length === 0 ? (
              <div style={{ padding: 60, textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--t3)', lineHeight: 2 }}>
                nessun log disponibile<br />
                <span style={{ fontSize: 10 }}>avvia un fetch per generare i log del connettore</span>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--bd2)' }}>
                    {['Ora', 'Livello', 'Messaggio', 'Meta'].map(h => (
                      <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 9, fontWeight: 600, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.1em', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => {
                    const ls = LEVEL_STYLE[log.level] ?? LEVEL_STYLE.INFO
                    return (
                      <tr key={log.id} style={{ borderBottom: '1px solid rgba(24,37,56,.6)' }}>
                        <td style={{ padding: '8px 14px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t3)', whiteSpace: 'nowrap' }}>
                          {fmtDatetime(log.created_at)}
                        </td>
                        <td style={{ padding: '8px 14px' }}>
                          <span style={{
                            fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700,
                            padding: '2px 8px', borderRadius: 2, letterSpacing: '.06em',
                            background: ls.bg, color: ls.color,
                          }}>
                            {log.level}
                          </span>
                        </td>
                        <td style={{ padding: '8px 14px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t1)' }}>
                          {log.message}
                        </td>
                        <td style={{ padding: '8px 14px' }}>
                          {log.meta && Object.keys(log.meta).length > 0 ? (
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t3)' }}>
                              {JSON.stringify(log.meta)}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--t3)', fontSize: 10 }}>—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── IOCS ── */}
        {tab === 'iocs' && (
          <div>
            {!iocData || iocData.items.length === 0 ? (
              <div style={{ padding: 60, textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--t3)', lineHeight: 2 }}>
                nessun IOC recuperato da questa sorgente<br />
                <span style={{ fontSize: 10 }}>avvia un fetch per importare gli indicatori</span>
              </div>
            ) : (
              <>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--bd2)' }}>
                      {['Valore', 'Tipo', 'Score', 'TLP', 'Stato', 'Ultimo avvistamento'].map(h => (
                        <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 9, fontWeight: 600, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.1em', whiteSpace: 'nowrap' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {iocData.items.map(ioc => (
                      <tr key={ioc.id} style={{ borderBottom: '1px solid rgba(24,37,56,.6)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(13,22,32,.8)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '8px 14px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t0)', maxWidth: 340 }}>
                          <span style={{ wordBreak: 'break-all' }}>{ioc.value}</span>
                        </td>
                        <td style={{ padding: '8px 14px' }}>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 2, background: 'var(--bg3)', color: 'var(--t2)', letterSpacing: '.05em' }}>
                            {ioc.ioc_type}
                          </span>
                        </td>
                        <td style={{ padding: '8px 14px' }}>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: scoreColor(ioc.score) }}>
                            {Math.round(ioc.score)}
                          </span>
                        </td>
                        <td style={{ padding: '8px 14px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t2)' }}>
                          {ioc.tlp}
                        </td>
                        <td style={{ padding: '8px 14px', fontFamily: 'var(--mono)', fontSize: 10, color: ioc.status === 'active' ? 'var(--green)' : 'var(--t3)' }}>
                          {ioc.status}
                        </td>
                        <td style={{ padding: '8px 14px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t3)' }}>
                          {relTime(ioc.last_seen)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Pagination */}
                {iocData.total > 50 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--bd1)' }}>
                    <button
                      onClick={() => setIocPage(p => Math.max(1, p - 1))}
                      disabled={iocPage <= 1}
                      style={{ background: 'var(--bg3)', border: '1px solid var(--bd2)', borderRadius: 2, padding: '4px 12px', fontFamily: 'var(--mono)', fontSize: 10, color: iocPage <= 1 ? 'var(--t3)' : 'var(--t1)', cursor: iocPage <= 1 ? 'default' : 'pointer' }}
                    >
                      ← prec
                    </button>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t2)' }}>
                      {iocPage} / {Math.ceil(iocData.total / 50)}
                    </span>
                    <button
                      onClick={() => setIocPage(p => p + 1)}
                      disabled={iocPage >= Math.ceil(iocData.total / 50)}
                      style={{ background: 'var(--bg3)', border: '1px solid var(--bd2)', borderRadius: 2, padding: '4px 12px', fontFamily: 'var(--mono)', fontSize: 10, color: iocPage >= Math.ceil(iocData.total / 50) ? 'var(--t3)' : 'var(--t1)', cursor: iocPage >= Math.ceil(iocData.total / 50) ? 'default' : 'pointer' }}
                    >
                      succ →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
