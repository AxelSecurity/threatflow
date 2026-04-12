import { useState, useEffect } from 'react'
import { useIocs } from '../hooks/useIocs'
import type { Ioc } from '../lib/api'

const TYPE_COLOR: Record<string, string> = {
  ipv4:'#4488ff', ipv6:'#4488ff', domain:'#a855f7',
  url:'#22d3ee', md5:'#4a7090', sha1:'#4a7090', sha256:'#4a7090', email:'#ffaa20',
}

function scoreColor(s: number) {
  return s >= 80 ? '#ff3355' : s >= 60 ? '#ffaa20' : '#00f090'
}

function relTime(iso: string | null) {
  if (!iso) return '—'
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3600000)
  if (h < 1) return '<1h fa'
  if (h < 24) return `${h}h fa`
  return `${Math.floor(h / 24)}g fa`
}

function trunc(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s
}

function Sparkline({ color }: { color: string }) {
  const data = Array.from({ length: 7 }, (_, i) => 40 + Math.random() * 50 + i * 3)
  const mn = Math.min(...data), mx = Math.max(...data), range = mx - mn || 1
  const pts = data.map((v, i) => [i * (120 / 6), 28 - ((v - mn) / range * 22 + 3)])
  const d = 'M' + pts.map(p => p.join(',')).join('L')
  const area = `M${pts[0][0]},28L${d.slice(1)}L${pts[5][0]},28Z`
  return (
    <svg viewBox="0 0 120 28" preserveAspectRatio="none" style={{ width: '100%', height: 28 }}>
      <defs>
        <linearGradient id={`sg-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.2} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sg-${color.replace('#','')})`} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

interface StatCardProps {
  value: number; label: string; color: string; trend: string; trendUp: boolean
  onClick: () => void
}
function StatCard({ value, label, color, trend, trendUp, onClick }: StatCardProps) {
  const [displayed, setDisplayed] = useState(0)
  useEffect(() => {
    let v = 0
    const step = Math.ceil(value / 40)
    const t = setInterval(() => {
      v = Math.min(v + step, value)
      setDisplayed(v)
      if (v >= value) clearInterval(t)
    }, 30)
    return () => clearInterval(t)
  }, [value])
  return (
    <div onClick={onClick} style={{
      background: 'var(--bg1)', padding: '16px 20px', borderRight: '1px solid var(--bd1)',
      position: 'relative', overflow: 'hidden', cursor: 'pointer',
    }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg2)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg1)')}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: color }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 26, fontWeight: 700, color, lineHeight: 1 }}>
          {displayed.toLocaleString('it-IT')}
        </span>
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 10, padding: '2px 6px', borderRadius: 2,
          background: trendUp ? 'rgba(0,240,144,.07)' : 'rgba(255,51,85,.07)',
          color: trendUp ? 'var(--green)' : 'var(--red)',
          border: `1px solid ${trendUp ? 'rgba(0,240,144,.2)' : 'rgba(255,51,85,.2)'}`,
        }}>{trend}</span>
      </div>
      <div style={{ fontSize: 10, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>
        {label}
      </div>
      <Sparkline color={color} />
    </div>
  )
}

interface DetailPanelProps { ioc: Ioc; onClose: () => void }
function DetailPanel({ ioc, onClose }: DetailPanelProps) {
  const fields: [string, React.ReactNode][] = [
    ['Tipo', <span style={{ fontFamily: 'var(--mono)', fontSize: 10, padding: '2px 7px', borderRadius: 2, background: 'rgba(68,136,255,.08)', color: '#4488ff', border: '1px solid rgba(68,136,255,.2)' }}>{ioc.ioc_type.toUpperCase()}</span>],
    ['TLP', <span style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 2, background: tlpBg(ioc.tlp), color: tlpColor(ioc.tlp), border: `1px solid ${tlpBorder(ioc.tlp)}` }}>{ioc.tlp.toUpperCase()}</span>],
    ['Score', <span style={{ fontFamily: 'var(--mono)', color: scoreColor(ioc.score), fontWeight: 700 }}>{ioc.score}/100</span>],
    ['Status', <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: ioc.status === 'active' ? 'var(--green)' : 'var(--t3)' }}>{ioc.status}</span>],
    ['Primo visto', new Date(ioc.first_seen ?? '').toLocaleDateString('it-IT')],
    ['Ultimo visto', new Date(ioc.last_seen ?? '').toLocaleDateString('it-IT')],
    ['Sorgenti', ioc.sources.join(', ') || '—'],
    ['Tags', ioc.tags.join(', ') || '—'],
  ]
  return (
    <div style={{ background: 'var(--bg1)', borderTop: '1px solid var(--bd2)', padding: '14px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--t1)', wordBreak: 'break-all' }}>{ioc.value}</span>
        <button onClick={onClose} style={{ background: 'none', border: '1px solid var(--bd1)', borderRadius: 2, padding: '3px 10px', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--t2)', cursor: 'pointer' }}>✕ chiudi</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
        {fields.map(([label, val]) => (
          <div key={label}>
            <div style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>{label}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{val}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function tlpBg(t: string) { return t==='RED'?'rgba(255,51,85,.07)':t==='AMBER'?'rgba(255,170,32,.08)':t==='GREEN'?'rgba(0,240,144,.07)':'rgba(255,255,255,.06)' }
function tlpColor(t: string) { return t==='RED'?'#ff3355':t==='AMBER'?'#ffaa20':t==='GREEN'?'#00f090':'#8899aa' }
function tlpBorder(t: string) { return t==='RED'?'rgba(255,51,85,.25)':t==='AMBER'?'rgba(255,170,32,.25)':t==='GREEN'?'rgba(0,240,144,.2)':'rgba(255,255,255,.1)' }

export default function Dashboard() {
  const [page, setPage]     = useState(1)
  const [q, setQ]           = useState('')
  const [fType, setFType]   = useState('')
  const [fStatus, setFStatus] = useState('')
  const [selId, setSelId]   = useState<string | null>(null)

  const { data, isLoading } = useIocs({
    page, size: 10,
    ...(q        ? { q }         : {}),
    ...(fType    ? { ioc_type: fType } : {}),
    ...(fStatus  ? { status: fStatus } : {}),
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const selIoc = items.find(i => i.id === selId) ?? null

  const TYPES = ['', 'ipv4', 'ipv6', 'domain', 'url', 'sha256', 'email']
  const STATUSES = ['', 'active', 'expired']

  function Chip({ val, active, label, onClick }: { val: string; active: boolean; label: string; onClick: () => void }) {
    return (
      <button onClick={onClick} style={{
        background: active ? 'var(--cyanx)' : 'var(--bg2)',
        border: `1px solid ${active ? 'var(--cyan2)' : 'var(--bd1)'}`,
        borderRadius: 2, padding: '4px 10px',
        fontFamily: 'var(--mono)', fontSize: 10,
        color: active ? 'var(--cyan)' : 'var(--t2)',
        cursor: 'pointer', letterSpacing: '.03em', transition: 'all .12s',
      }}>
        {label || 'tutti'}
      </button>
    )
  }

  return (
    <div style={{ minHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column' }}>

      {/* SCAN HEADER */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 16, padding: '10px 20px', background: 'var(--bg1)', borderBottom: '1px solid var(--bd1)', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: '-100%', width: '40%', height: '100%', background: 'linear-gradient(90deg,transparent,rgba(0,212,255,.04),transparent)', animation: 'scanline 4s ease-in-out infinite' }} />
        <style>{`@keyframes scanline{0%{left:-40%}100%{left:140%}}`}</style>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.1em' }}>Threat</span>
          <div style={{ display: 'flex', gap: 2 }}>
            {[1,1,1,0,0].map((on, i) => (
              <div key={i} style={{ width: 18, height: 6, borderRadius: 1, background: on ? (i < 2 ? 'var(--green)' : 'var(--amber)') : 'var(--bg3)' }} />
            ))}
          </div>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: 'var(--amber)', letterSpacing: '.08em' }}>MEDIUM</span>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{total.toLocaleString('it-IT')}</div>
          <div style={{ fontSize: 9, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.08em', marginTop: 1 }}>IOC totali</div>
        </div>
      </div>

      {/* STATS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', borderBottom: '1px solid var(--bd1)' }}>
        <StatCard value={total} label="IOC totali" color="var(--cyan)" trend="+124 oggi" trendUp onClick={() => { setFStatus(''); setFType('') }} />
        <StatCard value={Math.round(total * 0.92)} label="Attivi" color="var(--green)" trend="92%" trendUp onClick={() => setFStatus('active')} />
        <StatCard value={Math.round(total * 0.065)} label="Scaduti" color="var(--amber)" trend="+8" trendUp={false} onClick={() => setFStatus('expired')} />
        <StatCard value={Math.round(total * 0.12)} label="Score > 80" color="var(--red)" trend="+18" trendUp={false} onClick={() => {}} />
      </div>

      {/* TOOLBAR */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: 'var(--bg1)', borderBottom: '1px solid var(--bd1)', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', fontSize: 14, pointerEvents: 'none' }}>⌕</span>
          <input value={q} onChange={e => { setQ(e.target.value); setPage(1) }}
            placeholder="cerca ip, dominio, hash, url…"
            style={{ width: '100%', background: 'var(--bg2)', border: '1px solid var(--bd1)', borderRadius: 3, padding: '7px 12px 7px 32px', color: 'var(--t0)', fontFamily: 'var(--mono)', fontSize: 11, outline: 'none' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {TYPES.map(t => (
            <Chip key={t} val={t} active={fType === t} label={t || 'tutti'} onClick={() => { setFType(t); setPage(1) }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {STATUSES.map(s => (
            <Chip key={s} val={s} active={fStatus === s} label={s || 'tutti'} onClick={() => { setFStatus(s); setPage(1) }} />
          ))}
        </div>
      </div>

      {/* TABLE */}
      <div style={{ flex: 1, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--bd2)' }}>
              {['Indicatore','Tipo','TLP','Score','Status','Sorgenti','Ultimo visto'].map(h => (
                <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 9, fontWeight: 600, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.1em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--t3)' }}>caricamento...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--t3)' }}>nessun IOC trovato</td></tr>
            ) : items.map(ioc => {
              const col = scoreColor(ioc.score)
              const isSel = ioc.id === selId
              return (
                <tr key={ioc.id}
                  onClick={() => setSelId(isSel ? null : ioc.id)}
                  style={{ borderBottom: '1px solid rgba(24,37,56,.8)', cursor: 'pointer', background: isSel ? 'rgba(0,212,255,.03)' : 'transparent', transition: 'background .1s' }}
                  onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'rgba(13,22,32,.8)' }}
                  onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent' }}
                >
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: TYPE_COLOR[ioc.ioc_type] ?? '#4a7090', flexShrink: 0 }} />
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ioc.value}>
                        {trunc(ioc.value, 38)}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 2, letterSpacing: '.06em', background: 'rgba(68,136,255,.08)', color: '#4488ff', borderLeft: '2px solid #4488ff' }}>
                      {ioc.ioc_type.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 2, letterSpacing: '.08em', background: tlpBg(ioc.tlp), color: tlpColor(ioc.tlp), border: `1px solid ${tlpBorder(ioc.tlp)}` }}>
                      {ioc.tlp.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 90 }}>
                      <div style={{ flex: 1, height: 3, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 2, width: `${ioc.score}%`, background: col, transition: 'width .4s' }} />
                      </div>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, width: 26, textAlign: 'right', color: col }}>{ioc.score}</span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: ioc.status === 'active' ? 'var(--green)' : 'var(--t3)', animation: ioc.status === 'active' ? 'pulse 3s infinite' : 'none' }} />
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: ioc.status === 'active' ? 'var(--green)' : 'var(--t3)' }}>{ioc.status}</span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, background: 'var(--bg3)', border: '1px solid var(--bd1)', borderRadius: 2, padding: '2px 7px', color: 'var(--t1)' }}>
                      {ioc.sources.length}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t3)' }}>
                    {relTime(ioc.last_seen)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* DETAIL PANEL */}
      {selIoc && <DetailPanel ioc={selIoc} onClose={() => setSelId(null)} />}

      {/* FOOTER */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', background: 'var(--bg1)', borderTop: '1px solid var(--bd1)' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--t3)' }}>
          {total > 0 ? `${(page-1)*10+1}–${Math.min(page*10, total)} di ${total} indicatori` : '0 risultati'}
        </span>
        <div style={{ display: 'flex', gap: 3 }}>
          {Array.from({ length: Math.min(Math.ceil(total / 10), 7) }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => setPage(p)} style={{
              background: p === page ? 'var(--cyanx)' : 'var(--bg2)',
              border: `1px solid ${p === page ? 'var(--cyan2)' : 'var(--bd1)'}`,
              borderRadius: 2, padding: '4px 9px',
              fontFamily: 'var(--mono)', fontSize: 10,
              color: p === page ? 'var(--cyan)' : 'var(--t2)',
              cursor: 'pointer',
            }}>{p}</button>
          ))}
        </div>
      </div>
    </div>
  )
}
