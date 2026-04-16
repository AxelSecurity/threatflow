import { useState, useRef, useCallback, useEffect } from 'react'
import { useFlows, useCreateFlow, useUpdateFlow, useSources, useRunFlow, useFlowLogs, useNodeStats, useNodeAging } from '../hooks/useIocs'

const NW = 168, NH = 62

const NODE_DEFS: Record<string, { label: string; cat: 'i'|'p'|'o'; hasIn: boolean; hasOut: boolean; fields: Array<{key:string;label:string;type:string;options?:string[]}> }> = {
  source_ingest: { label:'Ingest Sorgente', cat:'i', hasIn:false, hasOut:true,  fields:[] },
  filter_type:  { label:'Filtro tipo',   cat:'p', hasIn:true,  hasOut:true,  fields:[{key:'ioc_type',label:'Tipo IOC',type:'multi',options:['ipv4','ipv6','domain','url','md5','sha1','sha256','email']}] },
  filter_tlp:   { label:'Filtro TLP',    cat:'p', hasIn:true,  hasOut:true,  fields:[{key:'tlp',label:'TLP',type:'select',options:['white','green','amber','red']}] },
  filter_score: { label:'Filtro score',  cat:'p', hasIn:true,  hasOut:true,  fields:[{key:'min_score',label:'Score minimo',type:'range'}] },
  dedup:        { label:'Dedup',         cat:'p', hasIn:true,  hasOut:true,  fields:[{key:'window_h',label:'Finestra (h)',type:'number'}] },
  aging:        { label:'Aging (TTL)',   cat:'p', hasIn:true,  hasOut:true,  fields:[
    {key:'value',label:'Valore',type:'number'},
    {key:'unit',label:'Unità',type:'select',options:['minutes','hours','days']}
  ] },
  export_flat:  { label:'Export flat',   cat:'o', hasIn:true,  hasOut:false, fields:[{key:'format',label:'Formato',type:'select',options:['txt','csv','json']}] },
  siem_out:     { label:'SIEM/Syslog',   cat:'o', hasIn:true,  hasOut:false, fields:[{key:'host',label:'Host',type:'text'},{key:'port',label:'Porta',type:'number'},{key:'proto',label:'Proto',type:'select',options:['syslog','cef']}] },
  firewall_out: { label:'Firewall REST', cat:'o', hasIn:true,  hasOut:false, fields:[{key:'url',label:'Endpoint',type:'text'},{key:'api_key',label:'API Key',type:'password'}] },
  taxii_out:    { label:'TAXII Out',     cat:'o', hasIn:true,  hasOut:false, fields:[{key:'url',label:'URL',type:'text'},{key:'collection',label:'Collection',type:'text'}] },
  // Legacy types to prevent crash on old data
  http_feed:    { label:'HTTP Feed (Legacy)', cat:'i', hasIn:false, hasOut:true, fields:[] },
  taxii_in:     { label:'TAXII In (Legacy)',  cat:'i', hasIn:false, hasOut:true, fields:[] },
  misp_in:      { label:'MISP In (Legacy)',   cat:'i', hasIn:false, hasOut:true, fields:[] },
  manual_in:    { label:'Manual In (Legacy)', cat:'i', hasIn:false, hasOut:true, fields:[] },
}

const getDef = (type: string) => NODE_DEFS[type] || { label:'Unknown', cat:'p' as const, hasIn:true, hasOut:true, fields:[] }

const CAT_COLOR = { i:'#00dfa0', p:'#f0a020', o:'#ff5572' }

interface NodeData { 
  id:string; 
  type:string; 
  x:number; 
  y:number; 
  cfg:Record<string,any>;
  label?: string;
}
interface ConnData { id:string; from:string; to:string }

function bezier(x1:number,y1:number,x2:number,y2:number) {
  const d = Math.max(Math.abs(x2-x1)*.5, 55)
  return `M${x1},${y1} C${x1+d},${y1} ${x2-d},${y2} ${x2},${y2}`
}

function outPort(n:NodeData) { return { x:n.x+NW, y:n.y+NH/2 } }
function inPort(n:NodeData)  { return { x:n.x,    y:n.y+NH/2 } }

export default function FlowEditor() {
  const [id, setId]       = useState<string | null>(null)
  const [nodes, setNodes] = useState<NodeData[]>([])
  const [conns, setConns] = useState<ConnData[]>([])
  const [sel, setSel]     = useState<string|null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [drag, setDrag]   = useState<{id:string;sx:number;sy:number;ox:number;oy:number}|null>(null)
  const [wire, setWire]   = useState<{fid:string;cx:number;cy:number}|null>(null)
  const [cfg,  setCfg]    = useState<Record<string,any>>({})
  const [localLabel, setLocalLabel] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [agingPage, setAgingPage] = useState(1)
  const [agingSearch, setAgingSearch] = useState('')

  const { data: flows } = useFlows()
  const { data: sources } = useSources()
  const createFlow = useCreateFlow()
  const updateFlow = useUpdateFlow()
  const runFlow    = useRunFlow()
  const { data: flowLogs = [] } = useFlowLogs(id)
  const { data: nodeStats = {} } = useNodeStats(id)
  const { data: agingData } = useNodeAging(id, sel, { page: agingPage, search: agingSearch })

  const nc = useRef(0)
  const cc = useRef(0)
  const cvRef = useRef<HTMLDivElement>(null)
  const isInitialLoad = useRef(true)

  // Initialization: load or create flow
  useEffect(() => {
    if (!flows) return
    if (flows.length > 0) {
      const f = flows[0]
      setId(f.id)
      const def = f.definition as any
      setNodes(def.nodes?.map((n:any)=>( { 
        id:n.id, 
        type:n.type, 
        x:n.position.x, 
        y:n.position.y, 
        cfg:n.config,
        label:n.label 
      } )) || [])
      setConns(def.connections || [])
      nc.current = def.nodes?.length ? Math.max(...def.nodes.map((n:any)=>parseInt(n.id.replace('n',''))), 0) : 0
      cc.current = def.connections?.length ? Math.max(...def.connections.map((c:any)=>parseInt(c.id.replace('c',''))), 0) : 0
    } else {
      createFlow.mutate({ 
        name: 'Main Flow', 
        definition: { nodes: [], connections: [] }
      })
    }
  }, [flows])

  // Auto-save logic
  useEffect(() => {
    if (isInitialLoad.current) {
      if (nodes.length > 0) isInitialLoad.current = false
      return
    }
    if (!id) return

    setSaveStatus('saving')
    const timer = setTimeout(() => {
      setAgingPage(1)
      setAgingSearch('')
      const definition = {
        nodes: nodes.map(n=>({
          id:n.id,
          type:n.type,
          position:{x:n.x,y:n.y},
          config:n.cfg,
          label:n.label
        })),
        connections: conns.map(c=>({id:c.id,from:c.from,to:c.to}))
      }
      updateFlow.mutate({ id, body: { definition } }, {
        onSuccess: () => {
          setSaveStatus('saved')
          setTimeout(() => setSaveStatus(s => s === 'saved' ? 'idle' : s), 2000)
        },
        onError: () => setSaveStatus('error')
      })
    }, 1500)

    return () => clearTimeout(timer)
  }, [nodes, conns, id])

  const byId = (id:string) => nodes.find(n=>n.id===id)

  const cvPos = useCallback((cx:number,cy:number)=>{
    const r = cvRef.current?.getBoundingClientRect()
    if (!r) return {x:0,y:0}
    const wrap = cvRef.current?.parentElement
    return { x: cx - r.left + (wrap?.scrollLeft??0), y: cy - r.top + (wrap?.scrollTop??0) }
  },[])

  // sync cfg panel when selection changes
  useEffect(()=>{
    if (sel) {
      const n = byId(sel)
      if (n) {
        setCfg({...n.cfg})
        setLocalLabel(n.label || '')
      }
    }
  },[sel])

  const isLabelDuplicate = nodes.some(n => n.id !== sel && n.label && n.label.trim().toLowerCase() === localLabel.trim().toLowerCase())

  const applyCfg = () => {
    if (!sel || isLabelDuplicate) return
    setNodes(ns => ns.map(n => n.id===sel ? {...n, label: localLabel.trim(), cfg:{...cfg}} : n))
  }

  const deleteNode = (id:string) => {
    setNodes(ns=>ns.filter(n=>n.id!==id))
    setConns(cs=>cs.filter(c=>c.from!==id&&c.to!==id))
    if (sel===id) setSel(null)
  }

  const startDrag = (id:string, e:React.MouseEvent) => {
    const n = byId(id)!
    const p = cvPos(e.clientX, e.clientY)
    setDrag({ id, sx:p.x, sy:p.y, ox:n.x, oy:n.y })
  }

  useEffect(()=>{
    const onMove = (e:MouseEvent) => {
      if (drag) {
        const p = cvPos(e.clientX, e.clientY)
        setNodes(ns=>ns.map(n=>n.id===drag.id ? {...n, x:Math.max(0,drag.ox+(p.x-drag.sx)), y:Math.max(0,drag.oy+(p.y-drag.sy))} : n))
      }
      if (wire) {
        const p = cvPos(e.clientX, e.clientY)
        setWire(w => w ? {...w,cx:p.x,cy:p.y} : null)
      }
    }
    const onUp = (e:MouseEvent) => {
      if (wire) {
        const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement|null
        const portEl = el?.closest('[data-port]') as HTMLElement|null
        if (portEl?.dataset.port==='in') {
          const tid = portEl.dataset.nid!
          const tn = byId(tid)
          if (tid!==wire.fid && tn && NODE_DEFS[tn.type].hasIn &&
              !conns.find(c=>c.from===wire.fid&&c.to===tid)) {
            setConns(cs=>[...cs,{id:'c'+(++cc.current),from:wire.fid,to:tid}])
          }
        }
        setWire(null)
      }
      setDrag(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return ()=>{ window.removeEventListener('mousemove',onMove); window.removeEventListener('mouseup',onUp) }
  },[drag,wire,conns,byId,cvPos])

  const onCanvasMouseDown = (e:React.MouseEvent) => {
    const target = e.target as HTMLElement
    const portEl = target.closest('[data-port]') as HTMLElement|null
    if (portEl) {
      e.preventDefault(); e.stopPropagation()
      if (portEl.dataset.port === 'out') {
        const p = cvPos(e.clientX, e.clientY)
        setWire({ fid: portEl.dataset.nid!, cx:p.x, cy:p.y })
      }
      return
    }
    setSel(null)
    setModalOpen(false)
  }

  const onDrop = (e:React.DragEvent) => {
    e.preventDefault()
    const t = e.dataTransfer.getData('ntype')
    if (!t) return
    const p = cvPos(e.clientX, e.clientY)
    const d = NODE_DEFS[t]
    const id = 'n'+(++nc.current)
    const defCfg: Record<string,string|number> = {}
    
    if (t === 'source_ingest') {
      const sid = e.dataTransfer.getData('sid')
      const sname = e.dataTransfer.getData('sname')
      defCfg.source_id = sid
      defCfg.source_name = sname
    } else {
      d.fields.forEach(f=>{ defCfg[f.key] = f.type==='number'?0:f.type==='range'?50:'' })
    }
    
    setNodes(ns=>[...ns,{id,type:t,x:Math.max(0,p.x-NW/2),y:Math.max(0,p.y-NH/2),cfg:defCfg}])
    setSel(id)
  }

  const selNode = sel ? byId(sel) : null
  const selDef  = selNode ? getDef(selNode.type) : null

  const GROUPS: Array<{cat:'i'|'p'|'o';label:string}> = [{cat:'i',label:'Ingest (Sorgenti)'},{cat:'p',label:'Processing'},{cat:'o',label:'Output'}]

  return (
    <div style={{display:'flex',flexDirection:'column',height:'calc(100vh - 48px)',background:'#080b0f',fontFamily:'var(--mono)',color:'#dde6f0'}}>

      {/* TOPBAR */}
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'7px 14px',background:'#0f1318',borderBottom:'1px solid #232d3a',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:10,flex:1}}>
          <span style={{fontSize:10,color:'#4a5c70'}}>drag nodi dalla palette · trascina porta→porta per connettere</span>
          <div style={{width:1,height:12,background:'#232d3a'}}/>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <div style={{width:6,height:6,borderRadius:'50%',background:saveStatus==='saving'?'#f0a020':saveStatus==='error'?'#ff5572':saveStatus==='saved'?'#00dfa0':'#232d3a'}}/>
            <span style={{fontSize:9,color:saveStatus==='error'?'#ff5572':saveStatus==='saved'?'#00dfa0':'#4a5c70',textTransform:'uppercase',letterSpacing:'.05em'}}>
              {saveStatus==='saving'?'Salvataggio...':saveStatus==='saved'?'Salvato':saveStatus==='error'?'Errore salvataggio':'In attesa'}
            </span>
            {id && (
              <div style={{
                marginLeft: 18,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(0,223,160,0.05)',
                border: '1px solid rgba(0,223,160,0.2)',
                padding: '3px 10px',
                borderRadius: 20,
              }}>
                <div className="pulse-dot" style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#00dfa0',
                  boxShadow: '0 0 8px #00dfa0'
                }}/>
                <span style={{fontSize:9, fontWeight:700, color:'#00dfa0', letterSpacing:'.08em'}}>LIVE ENGINE</span>
              </div>
            )}
          </div>
        </div>
        {sel && <button onClick={()=>deleteNode(sel)} style={{background:'rgba(255,85,114,.08)',border:'1px solid rgba(255,85,114,.35)',borderRadius:3,padding:'4px 11px',fontFamily:'var(--mono)',fontSize:10,color:'#ff5572',cursor:'pointer'}}>elimina nodo</button>}
      </div>

      <div style={{display:'flex',flex:1,overflow:'hidden'}}>

        {/* PALETTE */}
        <div style={{width:154,background:'#0f1318',borderRight:'1px solid #232d3a',overflowY:'auto',flexShrink:0,paddingBottom:12}}>
          {GROUPS.map(({cat,label})=>(
            <div key={cat}>
              <div style={{fontSize:9,fontWeight:500,textTransform:'uppercase',letterSpacing:'.1em',color:'#3d5268',padding:'10px 11px 5px'}}>{label}</div>
              
              {cat === 'i' ? (
                /* Dynamic sources for Ingest */
                sources?.map(src => (
                  <div key={src.id} draggable onDragStart={e=>{
                    e.dataTransfer.setData('ntype','source_ingest');
                    e.dataTransfer.setData('sid', src.id);
                    e.dataTransfer.setData('sname', src.name);
                  }}
                    style={{display:'flex',alignItems:'center',gap:7,padding:'6px 11px',cursor:'grab',userSelect:'none',transition:'background .1s'}}
                    onMouseEnter={e=>(e.currentTarget.style.background='#161b23')}
                    onMouseLeave={e=>(e.currentTarget.style.background='transparent')}
                  >
                    <div style={{width:7,height:7,borderRadius:1.5,background:CAT_COLOR[cat],flexShrink:0}}/>
                    <span style={{fontSize:11,color:'#7a92aa',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{src.name}</span>
                  </div>
                ))
              ) : (
                /* Static nodes for P & O */
                Object.entries(NODE_DEFS).filter(([,d])=>d.cat===cat).map(([t,d])=>(
                  <div key={t} draggable onDragStart={e=>e.dataTransfer.setData('ntype',t)}
                    style={{display:'flex',alignItems:'center',gap:7,padding:'6px 11px',cursor:'grab',userSelect:'none',transition:'background .1s'}}
                    onMouseEnter={e=>(e.currentTarget.style.background='#161b23')}
                    onMouseLeave={e=>(e.currentTarget.style.background='transparent')}
                  >
                    <div style={{width:7,height:7,borderRadius:1.5,background:CAT_COLOR[cat],flexShrink:0}}/>
                    <span style={{fontSize:11,color:'#7a92aa'}}>{d.label}</span>
                  </div>
                ))
              )}
            </div>
          ))}
        </div>

        {/* CANVAS */}
        <div style={{flex:1,overflow:'scroll',position:'relative',background:'#080b0f',cursor:'crosshair'}}>
          <div ref={cvRef} style={{position:'relative',width:1800,height:1000,
            backgroundImage:'radial-gradient(circle,#1c2330 1px,transparent 1px)',
            backgroundSize:'22px 22px',backgroundPosition:'11px 11px'}}
            onMouseDown={onCanvasMouseDown}
            onDragOver={e=>e.preventDefault()}
            onDrop={onDrop}
          >
            {/* SVG connections */}
            <svg style={{position:'absolute',top:0,left:0,width:1800,height:1000,pointerEvents:'none',overflow:'visible'}}>
              {conns.map(c=>{
                const f=byId(c.from),t=byId(c.to)
                if(!f||!t) return null
                const p1=outPort(f),p2=inPort(t)
                const fDef = getDef(f.type)
                return (
                  <path key={c.id} d={bezier(p1.x,p1.y,p2.x,p2.y)}
                    fill="none" stroke={CAT_COLOR[fDef.cat]} strokeWidth={2} opacity={.65}
                    style={{pointerEvents:'stroke',cursor:'pointer'}}
                    onClick={()=>setConns(cs=>cs.filter(x=>x.id!==c.id))}
                  />
                )
              })}
              {wire && byId(wire.fid) && (()=>{
                const f=byId(wire.fid)!
                const p1=outPort(f)
                return <path d={bezier(p1.x,p1.y,wire.cx,wire.cy)} fill="none" stroke="#3d5268" strokeWidth={1.5} strokeDasharray="5 4" opacity={.8}/>
              })()}
            </svg>

            {/* Nodes */}
            {nodes.map(node=>{
              const d = getDef(node.type)
              const color = CAT_COLOR[d.cat]
              return (
                <div key={node.id}
                  onMouseDown={(e)=>{ 
                    const target = e.target as HTMLElement;
                    if (target.closest('[data-port]')) return; // Ignora se clicchi sul pallino
                    startDrag(node.id,e); 
                    setSel(node.id); 
                  }}
                  onClick={(e)=>{ 
                    const target = e.target as HTMLElement;
                    if (target.closest('[data-port]')) return; // Ignora se clicchi sul pallino
                    e.stopPropagation(); 
                    setSel(node.id); 
                    setModalOpen(true); 
                  }}
                  style={{
                    position:'absolute', left:node.x, top:node.y, width:NW, height:NH,
                    background:sel===node.id?'#161b23':'#0f1318', border:`1px solid ${sel===node.id?color:'#232d3a'}`,
                    borderRadius:6, cursor:'move', userSelect:'none', zIndex:sel===node.id?50:10,
                    boxShadow:sel===node.id?`0 0 15px ${color}33`:'0 4px 12px rgba(0,0,0,0.2)',
                    display:'flex', transition:'background 0.2s, border 0.2s'
                  }}
                >
                  {/* IOC COUNT BADGE */}
                  {nodeStats[node.id] !== undefined && (
                    <div style={{
                      position:'absolute', top:-8, right:-8, background:'#00dfa0', color:'#080b0f',
                      fontSize:9, fontWeight:800, padding:'2px 6px', borderRadius:10,
                      boxShadow:'0 2px 8px rgba(0,223,160,0.4)', zIndex:60,
                      border: '1px solid #161b23'
                    }}>
                      {nodeStats[node.id].toLocaleString()}
                    </div>
                  )}

                  <div style={{width:4, background:color, borderRadius:'6px 0 0 6px'}}/>
                  <div style={{flex:1, padding:'8px 10px', display:'flex', flexDirection:'column', justifyContent:'center', overflow:'hidden'}}>
                    <div style={{fontFamily:'var(--mono)',fontSize:11,fontWeight:700,color:'#dde6f0',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                      {node.type === 'source_ingest' ? (node.cfg.source_name as string || 'Sorgente') : (node.label || d.label)}
                    </div>
                    <div style={{fontSize:9, color:'#4a5c70', textTransform:'uppercase', letterSpacing:'.03em', marginTop:2}}>
                      {d.label} {node.cfg.format ? `· ${node.cfg.format}` : ''}
                    </div>
                  </div>
                  {d.hasIn && (
                    <div data-port="in" data-nid={node.id}
                      style={{position:'absolute',left:-7,top:'50%',transform:'translateY(-50%)',width:12,height:12,borderRadius:'50%',border:`2px solid ${color}88`,background:'#080b0f',zIndex:10,cursor:'default'}}
                    />
                  )}
                  {d.hasOut && (
                    <div data-port="out" data-nid={node.id}
                      style={{position:'absolute',right:-7,top:'50%',transform:'translateY(-50%)',width:12,height:12,borderRadius:'50%',border:`2px solid ${color}88`,background:'#080b0f',zIndex:10,cursor:'crosshair'}}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* MODAL WINDOW FOR NODE CONFIG & LOGS */}
        {selNode && modalOpen && (
          <div style={{
            position:'absolute', top:100, left:'50%', transform:'translateX(-50%)',
            width:600, maxHeight:'80vh', background:'#0f1318', border:'1px solid #232d3a',
            borderRadius:8, boxShadow:'0 20px 50px rgba(0,0,0,0.5)', zIndex:1000,
            display:'flex', flexDirection:'column', overflow:'hidden'
          }}>
            {/* Modal Header */}
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', background:'#161b23', borderBottom:'1px solid #232d3a'}}>
              <div style={{display:'flex', alignItems:'center', gap:10}}>
                <div style={{width:8, height:8, borderRadius:2, background:CAT_COLOR[selDef!.cat]}}/>
                <span style={{fontFamily:'var(--mono)', fontSize:13, color:'#dde6f0', fontWeight:600}}>
                  {selNode.type === 'source_ingest' ? (selNode.cfg.source_name as string) : selDef!.label}
                  <span style={{color:'#3d5268', marginLeft:10, fontSize:10, fontWeight:400}}>{selNode.id}</span>
                </span>
              </div>
              <button onClick={()=>setModalOpen(false)} style={{background:'transparent', border:'none', color:'#4a5c70', cursor:'pointer', fontSize:18}}>×</button>
            </div>

            <div style={{flex:1, overflowY:'auto', display:'flex'}}>
              {/* Left Side: Config */}
              <div style={{flex:1, padding:16, borderRight:'1px solid #232d3a'}}>
                <div style={{fontSize:10, fontWeight:600, textTransform:'uppercase', color:'#3d5268', marginBottom:12, letterSpacing:'.05em'}}>Configurazione</div>
                
                {selDef!.cat !== 'i' && (
                  <div style={{marginBottom:14}}>
                    <label style={{display:'block', fontSize:10, color:isLabelDuplicate ? '#ff5572' : '#4a5c70', marginBottom:5}}>
                      Nome Nodo {isLabelDuplicate && '(Già in uso)'}
                    </label>
                    <input type="text" value={localLabel} 
                      onChange={e => setLocalLabel(e.target.value)}
                      placeholder={selDef!.label}
                      style={{
                        width:'100%', 
                        background:'#1c2330', 
                        border:`1px solid ${isLabelDuplicate ? '#ff5572' : '#2a3240'}`, 
                        borderRadius:4, 
                        padding:'8px 10px', 
                        color:isLabelDuplicate ? '#ff5572' : '#dde6f0', 
                        fontFamily:'var(--mono)', 
                        fontSize:12, 
                        outline:'none'
                      }}/>
                  </div>
                )}

                {selNode.type === 'aging' && (
                  <div style={{marginTop:24, borderTop:'1px solid #232d3a', paddingTop:20}}>
                    <div style={{fontSize:10, fontWeight:600, textTransform:'uppercase', color:'#3d5268', marginBottom:12, letterSpacing:'.05em'}}>Monitoraggio Aging</div>
                    
                    <div style={{marginBottom:12}}>
                      <input type="text" placeholder="Cerca IOC in aging..." 
                        value={agingSearch} onChange={e => { setAgingSearch(e.target.value); setAgingPage(1); }}
                        style={{width:'100%', background:'#0f1318', border:'1px solid #232d3a', borderRadius:4, padding:'6px 10px', fontSize:11, color:'#dde6f0', outline:'none'}} />
                    </div>

                    <div style={{background:'#080b0f', borderRadius:4, border:'1px solid #232d3a', overflow:'hidden'}}>
                      <table style={{width:'100%', borderCollapse:'collapse', fontSize:10}}>
                        <thead>
                          <tr style={{background:'#161b23', textAlign:'left', color:'#4a5c70'}}>
                            <th style={{padding:8, fontWeight:600}}>Valore</th>
                            <th style={{padding:8, fontWeight:600}}>Sorgente</th>
                            <th style={{padding:8, fontWeight:600, textAlign:'right'}}>Scadenza</th>
                          </tr>
                        </thead>
                        <tbody>
                          {agingData?.items.length ? agingData.items.map((it:any) => (
                            <tr key={it.value} style={{borderTop:'1px solid #161b23', color:'#dde6f0'}}>
                              <td style={{padding:8, fontFamily:'var(--mono)', fontSize:10}}>{it.value}</td>
                              <td style={{padding:8, color:'#7a92aa'}}>{it.source_label}</td>
                              <td style={{padding:8, textAlign:'right', color:'#f0a020', fontWeight:600}}>
                                {it.remaining_sec > 60 ? `${Math.floor(it.remaining_sec/60)}m` : `${it.remaining_sec}s`}
                              </td>
                            </tr>
                          )) : (
                            <tr><td colSpan={3} style={{padding:12, textAlign:'center', color:'#3d5268'}}>Nessun IOC in aging</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {agingData && agingData.total > agingData.size && (
                      <div style={{display:'flex', justifyContent:'space-between', marginTop:10, alignItems:'center'}}>
                        <button onClick={()=>setAgingPage(p=>Math.max(1,p-1))} disabled={agingPage===1} style={{background:'#1c2330', border:'1px solid #2a3240', color:'#dde6f0', padding:'4px 8px', borderRadius:4, fontSize:10, opacity:agingPage===1?0.5:1}}>Prec</button>
                        <div style={{fontSize:10, color:'#4a5c70'}}>Pagina {agingPage}</div>
                        <button onClick={()=>setAgingPage(p=>p+1)} disabled={agingPage * agingData.size >= agingData.total} style={{background:'#1c2330', border:'1px solid #2a3240', color:'#dde6f0', padding:'4px 8px', borderRadius:4, fontSize:10, opacity:(agingPage * agingData.size >= agingData.total)?0.5:1}}>Succ</button>
                      </div>
                    )}
                  </div>
                )}
                {selNode.type === 'source_ingest' && (
                  <div style={{fontSize:11, color:'#7a92aa', background:'#161b23', padding:10, borderRadius:4, border:'1px solid #232d3a', marginBottom:16}}>
                    I parametri sono gestiti nella sezione <strong>Sorgenti</strong>.
                  </div>
                )}

                {selDef!.fields.map(f=>(
                  <div key={f.key} style={{marginBottom:14}}>
                    <label style={{display:'block', fontSize:10, color:'#4a5c70', marginBottom:5}}>
                      {f.label}{f.type==='range'&&<span style={{color:'#00dfa0', marginLeft:4}}>{cfg[f.key]??50}</span>}
                    </label>
                    {f.type==='select' ? (
                      <select value={String(cfg[f.key]??'')} onChange={e=>setCfg(c=>({...c,[f.key]:e.target.value}))}
                        style={{width:'100%', background:'#1c2330', border:'1px solid #2a3240', borderRadius:4, padding:'8px 10px', color:'#dde6f0', fontFamily:'var(--mono)', fontSize:12, outline:'none'}}>
                        {f.options?.map(o=><option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : f.type==='multi' ? (
                      <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
                        {f.options?.map(o=>{
                          const active = Array.isArray(cfg[f.key]) && (cfg[f.key] as any[]).includes(o);
                          return (
                            <div key={o} onClick={()=>{
                              const cur = Array.isArray(cfg[f.key]) ? (cfg[f.key] as any[]) : (cfg[f.key] ? [cfg[f.key]] : []);
                              const next = active ? cur.filter(x=>x!==o) : [...cur, o];
                              setCfg(c=>({...c,[f.key]:next}));
                            }} style={{
                              fontSize:10, padding:'4px 9px', borderRadius:4, cursor:'pointer',
                              background:active ? 'rgba(0,223,160,0.1)' : '#1c2330',
                              border:`1px solid ${active ? '#00dfa0' : '#2a3240'}`,
                              color:active ? '#00dfa0' : '#7a92aa',
                              transition:'all 0.1s'
                            }}>{o}</div>
                          )
                        })}
                      </div>
                    ) : f.type==='range' ? (
                      <input type="range" min={0} max={100} value={Number(cfg[f.key]??50)}
                        onChange={e=>setCfg(c=>({...c,[f.key]:Number(e.target.value)}))}
                        style={{width:'100%', accentColor:'#00dfa0', cursor:'pointer'}}/>
                    ) : (
                      <input type={f.type==='password'?'password':'text'} value={String(cfg[f.key]??'')}
                        placeholder={f.type==='password'?'••••':''}
                        onChange={e=>setCfg(c=>({...c,[f.key]:e.target.value}))}
                        style={{width:'100%', background:'#1c2330', border:'1px solid #2a3240', borderRadius:4, padding:'8px 10px', color:'#dde6f0', fontFamily:'var(--mono)', fontSize:12, outline:'none'}}/>
                    )}
                  </div>
                ))}
                
                {selDef!.fields.length > 0 || selDef!.cat !== 'i' ? (
                  <button 
                    onClick={applyCfg} 
                    disabled={isLabelDuplicate}
                    style={{
                      width:'100%', 
                      background: isLabelDuplicate ? '#232d3a' : '#00dfa0', 
                      border:'none', 
                      borderRadius:4, 
                      padding:'10px', 
                      fontFamily:'var(--mono)', 
                      fontSize:11, 
                      fontWeight:600, 
                      color: isLabelDuplicate ? '#4a5c70' : '#080b0f', 
                      cursor: isLabelDuplicate ? 'default' : 'pointer', 
                      marginTop:10
                    }}
                  >
                    SALVA CONFIGURAZIONE
                  </button>
                ) : null}

                {/* EXPORT URL FOR OUTPUT NODES ONLY */}
                {selDef!.cat === 'o' && id && (
                  <div style={{marginTop:24, paddingTop:16, borderTop:'1px dashed #232d3a'}}>
                    <div style={{fontSize:9, fontWeight:600, color:'#f0a020', textTransform:'uppercase', marginBottom:8}}>URL di Esportazione Dinamica</div>
                    {(() => {
                      const ext = selNode.cfg.format || 'txt';
                      const identifier = selNode.label || selNode.id;
                      const url = `${window.location.origin}/api/v1/export/node/${id}/${identifier}.${ext}`;
                      return (
                        <>
                          <div style={{background:'#080b0f', padding:8, borderRadius:4, fontSize:9, color:'#7a92aa', wordBreak:'break-all', fontFamily:'var(--mono)', border:'1px solid #161b23'}}>
                            {url}
                          </div>
                          <button 
                            onClick={() => navigator.clipboard.writeText(url)}
                            style={{marginTop:8, width:'100%', background:'transparent', border:'1px solid #f0a020', color:'#f0a020', borderRadius:4, padding:5, fontSize:9, cursor:'pointer'}}
                          >
                            COPIA URL
                          </button>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Right Side: Logs */}
              <div style={{width:240, background:'#080b0f', padding:16, overflowY:'auto'}}>
                <div style={{fontSize:10, fontWeight:600, textTransform:'uppercase', color:'#3d5268', marginBottom:12, letterSpacing:'.05em'}}>Log del Nodo</div>
                <div style={{display:'flex', flexDirection:'column', gap:8}}>
                  {flowLogs.filter(l => l.meta?.node_id === selNode.id).slice(0, 20).map((log: any) => {
                    const lc = log.level === 'ERROR' ? '#ff5572' : log.level === 'WARNING' ? '#f0a020' : '#00dfa0'
                    return (
                      <div key={log.id} style={{borderLeft:`2px solid ${lc}`, paddingLeft:8, paddingBottom:4}}>
                        <div style={{fontSize:8, color:lc, fontWeight:700}}>{log.level}</div>
                        <div style={{fontSize:10, color:'#dde6f0', lineHeight:1.4}}>{log.message}</div>
                        <div style={{fontSize:8, color:'#3d5268', marginTop:2}}>{new Date(log.created_at).toLocaleTimeString()}</div>
                      </div>
                    )
                  })}
                  {flowLogs.filter(l => l.meta?.node_id === selNode.id).length === 0 && (
                    <div style={{fontSize:11, color:'#3d5268', textAlign:'center', marginTop:24}}>Nessun log per questo nodo.<br/>Esegui il flow per aggiornare.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
