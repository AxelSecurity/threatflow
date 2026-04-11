// Dashboard component — see full implementation in conversation
// Connects to GET /api/v1/iocs with TanStack Query
import { useIocs } from '../hooks/useIocs'
import { useState } from 'react'

export default function Dashboard() {
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const { data, isLoading } = useIocs({ page, size: 50, q })

  if (isLoading) return <div style={{color:'#00d4ff',padding:20,fontFamily:'monospace'}}>Loading...</div>

  return (
    <div style={{background:'#05090e',minHeight:'100vh',color:'#ecf4ff',fontFamily:'system-ui'}}>
      <div style={{padding:'16px 20px',borderBottom:'1px solid #182538',background:'#090f17'}}>
        <h1 style={{fontFamily:'monospace',fontSize:16,color:'#00d4ff',letterSpacing:'.06em'}}>
          THREATFLOW <span style={{fontSize:10,color:'#4a7090'}}> v0.1</span>
        </h1>
      </div>
      <div style={{padding:16}}>
        <input value={q} onChange={e => setQ(e.target.value)}
          placeholder="Cerca IOC..."
          style={{background:'#0d1620',border:'1px solid #182538',borderRadius:3,
                  padding:'6px 12px',color:'#ecf4ff',fontFamily:'monospace',fontSize:11,
                  width:300,outline:'none'}}/>
        <div style={{marginTop:12,fontSize:12,color:'#4a7090'}}>
          {data?.total ?? 0} IOC trovati
        </div>
        <table style={{width:'100%',borderCollapse:'collapse',marginTop:8}}>
          <thead>
            <tr style={{borderBottom:'1px solid #1f3350'}}>
              {['Valore','Tipo','TLP','Score','Status'].map(h =>
                <th key={h} style={{padding:'8px 12px',textAlign:'left',fontSize:9,
                  color:'#4a7090',textTransform:'uppercase',letterSpacing:'.1em'}}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {data?.items?.map((ioc: Record<string, unknown>) => (
              <tr key={ioc.id as string} style={{borderBottom:'1px solid #182538'}}>
                <td style={{padding:'9px 12px',fontFamily:'monospace',fontSize:11}}>{ioc.value as string}</td>
                <td style={{padding:'9px 12px',fontSize:11}}>{ioc.ioc_type as string}</td>
                <td style={{padding:'9px 12px',fontSize:11}}>{ioc.tlp as string}</td>
                <td style={{padding:'9px 12px',fontFamily:'monospace',fontSize:11}}>{ioc.score as number}</td>
                <td style={{padding:'9px 12px',fontSize:11}}>{ioc.status as string}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
