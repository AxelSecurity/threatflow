import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useSources, useCreateSource, useToggleSource, useDeleteSource } from '../hooks/useIocs'
import { api } from '../lib/api'

const FEED_TYPES = ['http_feed', 'taxii_in', 'misp_in', 'manual_in']

const FEED_COLOR: Record<string, string> = {
  http_feed:  '#4488ff',
  taxii_in:   '#a855f7',
  misp_in:    '#00f090',
  manual_in:  '#ffaa20',
}

function relTime(iso: string | null) {
  if (!iso) return 'mai'
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3600000)
  if (h < 1) return '<1h fa'
  if (h < 24) return `${h}h fa`
  return `${Math.floor(h / 24)}g fa`
}

function fmtInterval(secs: number) {
  if (secs < 60) return `${secs}s`
  if (secs < 3600) return `${Math.round(secs / 60)}m`
  return `${Math.round(secs / 3600)}h`
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg3)',
  border: '1px solid var(--bd2)',
  borderRadius: 3,
  padding: '7px 10px',
  color: 'var(--t0)',
  fontFamily: 'var(--mono)',
  fontSize: 11,
  outline: 'none',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 9,
  color: 'var(--t2)',
  textTransform: 'uppercase',
  letterSpacing: '.08em',
  marginBottom: 5,
}

export default function Sources() {
  const qc       = useQueryClient()
  const navigate = useNavigate()
  const { data: sources = [], isLoading } = useSources()
  const createMut  = useCreateSource()
  const toggleMut  = useToggleSource()
  const deleteMut  = useDeleteSource()

  const [showForm, setShowForm]       = useState(false)
  const [form, setForm]               = useState({ name: '', feed_type: 'http_feed', url: '', fetch_interval: 3600 })
  const [formError, setFormError]     = useState('')
  const [nameError, setNameError]     = useState('')
  const [fetchingId, setFetchingId]   = useState<string | null>(null)
  const [fetchedIds, setFetchedIds]   = useState<Set<string>>(new Set())
  const [confirmDelId, setConfirmDelId] = useState<string | null>(null)

  const activeCount = sources.filter(s => s.active).length

  function resetForm() {
    setForm({ name: '', feed_type: 'http_feed', url: '', fetch_interval: 3600 })
    setNameError('')
    setFormError('')
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setNameError('nome obbligatorio'); return }
    setNameError('')
    setFormError('')
    try {
      await createMut.mutateAsync({
        name: form.name.trim(),
        feed_type: form.feed_type,
        url: form.url.trim() || null,
        fetch_interval: form.fetch_interval,
      })
      resetForm()
      setShowForm(false)
    } catch (err) {
      setFormError((err as Error).message)
    }
  }

  async function handleFetch(id: string) {
    setFetchingId(id)
    try {
      await api.sources.fetch(id)
      setFetchedIds(prev => new Set(prev).add(id))
      // Dopo 3s il worker ha quasi certamente finito: aggiorna sources (last_fetched) e iocs
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['sources'] })
        qc.invalidateQueries({ queryKey: ['iocs'] })
        setFetchedIds(prev => { const s = new Set(prev); s.delete(id); return s })
      }, 3000)
    } finally {
      setFetchingId(null)
    }
  }

  function handleDeleteClick(id: string) {
    if (confirmDelId === id) {
      deleteMut.mutate(id)
      setConfirmDelId(null)
    } else {
      setConfirmDelId(id)
    }
  }

  return (
    <div style={{ minHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column' }}>

      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '10px 20px', background: 'var(--bg1)', borderBottom: '1px solid var(--bd1)' }}>
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{sources.length}</div>
          <div style={{ fontSize: 9, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.08em', marginTop: 3 }}>sorgenti</div>
        </div>
        <div style={{ width: 1, height: 32, background: 'var(--bd1)' }} />
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700, lineHeight: 1, color: 'var(--green)' }}>{activeCount}</div>
          <div style={{ fontSize: 9, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.08em', marginTop: 3 }}>attive</div>
        </div>
        <div style={{ width: 1, height: 32, background: 'var(--bd1)' }} />
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700, lineHeight: 1, color: 'var(--amber)' }}>{sources.length - activeCount}</div>
          <div style={{ fontSize: 9, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.08em', marginTop: 3 }}>inattive</div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={() => { setShowForm(v => !v); resetForm() }}
            style={{
              background: showForm ? 'var(--bg3)' : 'var(--cyanx)',
              border: `1px solid ${showForm ? 'var(--bd1)' : 'var(--cyan2)'}`,
              borderRadius: 3, padding: '7px 16px',
              fontFamily: 'var(--mono)', fontSize: 11,
              color: showForm ? 'var(--t2)' : 'var(--cyan)',
              cursor: 'pointer', letterSpacing: '.04em',
            }}
          >
            {showForm ? '✕ annulla' : '+ nuova sorgente'}
          </button>
        </div>
      </div>

      {/* CREATE FORM */}
      {showForm && (
        <div style={{ background: 'var(--bg1)', borderBottom: '2px solid var(--bd2)', padding: '16px 20px' }}>
          <form onSubmit={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px 1fr 110px auto', gap: 12, alignItems: 'end' }}>
              <div>
                <label style={labelStyle}>Nome *</label>
                <input
                  value={form.name}
                  onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setNameError('') }}
                  placeholder="es. Feodo Tracker"
                  style={{ ...inputStyle, borderColor: nameError ? 'var(--red)' : 'var(--bd2)' }}
                  autoFocus
                />
                {nameError && <div style={{ fontSize: 9, color: 'var(--red)', marginTop: 3 }}>{nameError}</div>}
              </div>
              <div>
                <label style={labelStyle}>Tipo *</label>
                <select
                  value={form.feed_type}
                  onChange={e => setForm(f => ({ ...f, feed_type: e.target.value }))}
                  style={{ ...inputStyle }}
                >
                  {FEED_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>URL feed</label>
                <input
                  value={form.url}
                  onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                  placeholder="https://..."
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Intervallo (s)</label>
                <input
                  type="number"
                  min={60}
                  value={form.fetch_interval}
                  onChange={e => setForm(f => ({ ...f, fetch_interval: Math.max(60, Number(e.target.value)) }))}
                  style={inputStyle}
                />
              </div>
              <button
                type="submit"
                disabled={createMut.isPending}
                style={{
                  background: 'var(--greenx)', border: '1px solid var(--green2)',
                  borderRadius: 3, padding: '7px 18px',
                  marginBottom: nameError ? 18 : 0,
                  fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--green)',
                  cursor: createMut.isPending ? 'default' : 'pointer',
                  opacity: createMut.isPending ? 0.6 : 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {createMut.isPending ? 'salvataggio…' : '✓ crea'}
              </button>
            </div>
            {formError && (
              <div style={{ marginTop: 8, fontSize: 10, color: 'var(--red)', fontFamily: 'var(--mono)' }}>
                {formError}
              </div>
            )}
          </form>
        </div>
      )}

      {/* TABLE */}
      <div style={{ flex: 1, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--bd2)' }}>
              {['Nome', 'Tipo', 'URL', 'Intervallo', 'Ultimo fetch', 'Stato', 'Azioni'].map(h => (
                <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 9, fontWeight: 600, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.1em', whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} style={{ padding: 48, textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--t3)' }}>
                  caricamento...
                </td>
              </tr>
            ) : sources.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: 60, textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--t3)', lineHeight: 2 }}>
                  nessuna sorgente configurata<br />
                  <span style={{ fontSize: 10 }}>usa "+ nuova sorgente" per iniziare</span>
                </td>
              </tr>
            ) : sources.map(src => {
              const col = FEED_COLOR[src.feed_type] ?? '#4a7090'
              const isFetching  = fetchingId === src.id
              const justFetched = fetchedIds.has(src.id)
              const isConfirm   = confirmDelId === src.id
              return (
                <tr
                  key={src.id}
                  onClick={() => { if (confirmDelId) setConfirmDelId(null) }}
                  style={{ borderBottom: '1px solid rgba(24,37,56,.8)', transition: 'background .1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(13,22,32,.8)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Name — click → detail page */}
                  <td style={{ padding: '10px 14px' }}>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                      onClick={e => { e.stopPropagation(); navigate(`/sources/${src.id}`) }}
                    >
                      <div style={{ width: 3, height: 20, borderRadius: 2, background: col, flexShrink: 0 }} />
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--cyan)', textDecoration: 'underline', textUnderlineOffset: 3, textDecorationColor: 'rgba(0,212,255,.3)' }}>
                        {src.name}
                      </span>
                    </div>
                  </td>

                  {/* Type badge */}
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{
                      fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700,
                      padding: '2px 8px', borderRadius: 2, letterSpacing: '.05em',
                      background: `${col}18`, color: col, borderLeft: `2px solid ${col}`,
                    }}>
                      {src.feed_type}
                    </span>
                  </td>

                  {/* URL */}
                  <td style={{ padding: '10px 14px', maxWidth: 240 }}>
                    {src.url
                      ? <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }} title={src.url}>
                          {src.url.length > 42 ? src.url.slice(0, 40) + '…' : src.url}
                        </span>
                      : <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t3)' }}>—</span>
                    }
                  </td>

                  {/* Interval */}
                  <td style={{ padding: '10px 14px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t1)' }}>
                    {fmtInterval(src.fetch_interval)}
                  </td>

                  {/* Last fetched */}
                  <td style={{ padding: '10px 14px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t3)' }}>
                    {relTime(src.last_fetched)}
                  </td>

                  {/* Toggle active */}
                  <td style={{ padding: '10px 14px' }}>
                    <button
                      onClick={e => { e.stopPropagation(); toggleMut.mutate(src.id) }}
                      disabled={toggleMut.isPending}
                      style={{
                        background: src.active ? 'var(--greenx)' : 'var(--bg3)',
                        border: `1px solid ${src.active ? 'var(--green2)' : 'var(--bd2)'}`,
                        borderRadius: 2, padding: '3px 10px',
                        fontFamily: 'var(--mono)', fontSize: 9,
                        color: src.active ? 'var(--green)' : 'var(--t3)',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                      }}
                    >
                      <div style={{
                        width: 5, height: 5, borderRadius: '50%',
                        background: src.active ? 'var(--green)' : 'var(--t3)',
                        animation: src.active ? 'pulse 3s infinite' : 'none',
                      }} />
                      {src.active ? 'attiva' : 'inattiva'}
                    </button>
                  </td>

                  {/* Actions */}
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 5 }}>
                      {/* Manual fetch trigger */}
                      <button
                        onClick={e => { e.stopPropagation(); handleFetch(src.id) }}
                        disabled={isFetching || justFetched}
                        title="avvia fetch manuale"
                        style={{
                          background: justFetched ? 'var(--greenx)' : 'var(--bg3)',
                          border: `1px solid ${justFetched ? 'var(--green2)' : 'var(--bd1)'}`,
                          borderRadius: 2, padding: '3px 9px', minWidth: 58,
                          fontFamily: 'var(--mono)', fontSize: 9,
                          color: justFetched ? 'var(--green)' : isFetching ? 'var(--t3)' : 'var(--cyan)',
                          cursor: isFetching || justFetched ? 'default' : 'pointer',
                          opacity: isFetching ? 0.5 : 1,
                        }}
                      >
                        {isFetching ? '⟳ …' : justFetched ? '✓ ok' : '⟳ fetch'}
                      </button>

                      {/* Delete — two-click confirm */}
                      <button
                        onClick={e => { e.stopPropagation(); handleDeleteClick(src.id) }}
                        disabled={deleteMut.isPending}
                        title={isConfirm ? 'conferma eliminazione' : 'elimina sorgente'}
                        style={{
                          background: isConfirm ? 'var(--redx)' : 'var(--bg3)',
                          border: `1px solid ${isConfirm ? 'rgba(255,51,85,.3)' : 'var(--bd1)'}`,
                          borderRadius: 2, padding: '3px 9px',
                          fontFamily: 'var(--mono)', fontSize: 9,
                          color: isConfirm ? 'var(--red)' : 'var(--t3)',
                          cursor: 'pointer', whiteSpace: 'nowrap',
                        }}
                      >
                        {isConfirm ? 'sicuro?' : '✕'}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* FOOTER */}
      <div style={{ padding: '8px 20px', background: 'var(--bg1)', borderTop: '1px solid var(--bd1)', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t3)' }}>
        {sources.length} sorgenti configurate · {activeCount} attive · {sources.length - activeCount} inattive
      </div>
    </div>
  )
}
