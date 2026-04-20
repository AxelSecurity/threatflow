import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFlows, useCreateFlow, useDeleteFlow } from '../hooks/useIocs'

export default function Flows() {
  const navigate = useNavigate()
  const { data: flows = [], isLoading } = useFlows()
  const createMut = useCreateFlow()
  const deleteMut = useDeleteFlow()

  const [showForm, setShowForm] = useState(false)
  const [newFlowName, setNewFlowName] = useState('')
  const [confirmDelId, setConfirmDelId] = useState<string | null>(null)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newFlowName.trim()) return
    try {
      const flow = await createMut.mutateAsync({
        name: newFlowName.trim(),
        definition: { nodes: [], connections: [] }
      })
      // Aggiungi ai tab aperti in localStorage
      const open = JSON.parse(localStorage.getItem('tf_open_flows') || '[]')
      if (!open.includes(flow.id)) {
        localStorage.setItem('tf_open_flows', JSON.stringify([...open, flow.id]))
      }
      navigate(`/flows/${flow.id}`)
    } catch (err) {
      console.error(err)
    }
  }

  const openFlow = (id: string) => {
    const open = JSON.parse(localStorage.getItem('tf_open_flows') || '[]')
    if (!open.includes(id)) {
      localStorage.setItem('tf_open_flows', JSON.stringify([...open, id]))
    }
    navigate(`/flows/${id}`)
  }

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (confirmDelId === id) {
      deleteMut.mutate(id)
      setConfirmDelId(null)
      // Rimuovi dai tab aperti
      const open = JSON.parse(localStorage.getItem('tf_open_flows') || '[]')
      localStorage.setItem('tf_open_flows', JSON.stringify(open.filter((x:string) => x !== id)))
    } else {
      setConfirmDelId(id)
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--t0)', margin: 0 }}>Gestione Flow</h1>
          <p style={{ fontSize: '12px', color: 'var(--t2)', marginTop: '4px' }}>Crea e gestisci le tue pipeline di analisi</p>
        </div>
        <button 
          onClick={() => setShowForm(!showForm)}
          style={{ 
            background: 'var(--cyanx)', border: '1px solid var(--cyan2)', 
            color: 'var(--cyan)', padding: '8px 16px', borderRadius: '4px',
            fontFamily: 'var(--mono)', fontSize: '12px', cursor: 'pointer'
          }}
        >
          {showForm ? 'Annulla' : '+ Nuovo Flow'}
        </button>
      </div>

      {showForm && (
        <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd1)', padding: '20px', borderRadius: '8px', marginBottom: '32px' }}>
          <form onSubmit={handleCreate} style={{ display: 'flex', gap: '12px' }}>
            <input 
              type="text" 
              placeholder="Nome del flow (es. Analisi Malware)" 
              value={newFlowName}
              onChange={e => setNewFlowName(e.target.value)}
              style={{ 
                flex: 1, background: 'var(--bg3)', border: '1px solid var(--bd2)', 
                padding: '10px', color: 'var(--t0)', borderRadius: '4px', fontFamily: 'var(--mono)'
              }}
              autoFocus
            />
            <button 
              type="submit"
              disabled={createMut.isPending}
              style={{ 
                background: 'var(--greenx)', border: '1px solid var(--green2)', 
                color: 'var(--green)', padding: '0 24px', borderRadius: '4px',
                fontFamily: 'var(--mono)', fontWeight: 700, cursor: 'pointer'
              }}
            >
              Crea
            </button>
          </form>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
        {isLoading ? (
          <div style={{ color: 'var(--t3)', fontFamily: 'var(--mono)' }}>Caricamento flow...</div>
        ) : flows.map(flow => (
          <div 
            key={flow.id} 
            onClick={() => openFlow(flow.id)}
            style={{ 
              background: 'var(--bg1)', border: '1px solid var(--bd1)', 
              borderRadius: '8px', padding: '20px', cursor: 'pointer',
              transition: 'border-color 0.2s', position: 'relative'
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--cyan)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--bd1)')}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div style={{ 
                width: '8px', height: '8px', borderRadius: '50%', 
                background: flow.active ? 'var(--green)' : 'var(--t3)',
                boxShadow: flow.active ? '0 0 8px var(--green)' : 'none'
              }} />
              <button 
                onClick={(e) => handleDelete(e, flow.id)}
                style={{ background: 'transparent', border: 'none', color: 'var(--t3)', cursor: 'pointer', padding: '4px' }}
              >
                {confirmDelId === flow.id ? 'Sicuro?' : '✕'}
              </button>
            </div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--t0)', marginBottom: '8px' }}>{flow.name}</h3>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ fontSize: '10px', color: 'var(--t2)', textTransform: 'uppercase' }}>
                {flow.definition.nodes?.length || 0} Nodi
              </div>
              <div style={{ fontSize: '10px', color: 'var(--t2)', textTransform: 'uppercase' }}>
                {flow.active ? 'Attivo' : 'Inattivo'}
              </div>
            </div>
            {flow.warnings && flow.warnings.length > 0 && (
              <div style={{ marginTop: '12px', fontSize: '10px', color: 'var(--amber)', background: 'rgba(240,160,32,0.1)', padding: '4px 8px', borderRadius: '4px' }}>
                ⚠️ {flow.warnings.length} Problemi rilevati
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
