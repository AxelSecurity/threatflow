import { useState, useRef, useCallback, useEffect } from 'react'
import { useFlows, useCreateFlow, useUpdateFlow, useSources } from '../hooks/useIocs'

const NW = 168, NH = 62

const NODE_DEFS: Record<string, { label: string; cat: 'i'|'p'|'o'; hasIn: boolean; hasOut: boolean; fields: Array<{key:string;label:string;type:string;options?:string[]}> }> = {
  source_ingest: { label:'Ingest Sorgente', cat:'i', hasIn:false, hasOut:true,  fields:[] },
  filter_type:  { label:'Filtro tipo',   cat:'p', hasIn:true,  hasOut:true,  fields:[{key:'ioc_type',label:'Tipo IOC',type:'select',options:['ipv4','ipv6','domain','url','md5','sha1','sha256','email']}] },
  filter_tlp:   { label:'Filtro TLP',    cat:'p', hasIn:true,  hasOut:true,  fields:[{key:'tlp',label:'TLP',type:'select',options:['white','green','amber','red']}] },
  filter_score: { label:'Filtro score',  cat:'p', hasIn:true,  hasOut:true,  fields:[{key:'min_score',label:'Score minimo',type:'range'}] },
  dedup:        { label:'Dedup',         cat:'p', hasIn:true,  hasOut:true,  fields:[{key:'window_h',label:'Finestra (h)',type:'number'}] },
  export_flat:  { label:'Export flat',   cat:'o', hasIn:true,  hasOut:false, fields:[{key:'path',label:'Path',type:'text'},{key:'format',label:'Formato',type:'select',options:['txt','csv','json']}] },
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

interface NodeData { id:string; type:string; x:number; y:number; cfg:Record<string,string|number> }
interface ConnData { id:string; from:string; to:string }

function bezier(x1:number,y1:number,x2:number,y2:number) {
  const d = Math.max(Math.abs(x2-x1)*.5, 55)
  return `M${x1},${y1} C${x1+d},${y1} ${x2-d},${y2} ${x2},${y2}`
}

function outPort(n:NodeData) { return { x:n.x+NW, y:n.y+NH/2 } }
function inPort(n:NodeData)  { return { x:n.x,    y:n.y+NH/2 } }

export default function FlowEditor() {
  const { data: flows } = useFlows()
  const { data: sources } = useSources()
  const createFlow = useCreateFlow()
  const updateFlow = useUpdateFlow()

  const [id, setId]       = useState<string | null>(null)
  const [nodes, setNodes] = useState<NodeData[]>([])
  const [conns, setConns] = useState<ConnData[]>([])
  const [sel, setSel]     = useState<string|null>(null)
  const [drag, setDrag]   = useState<{id:string;sx:number;sy:number;ox:number;oy:number}|null>(null)
  const [wire, setWire]   = useState<{fid:string;cx:number;cy:number}|null>(null)
  const [cfg,  setCfg]    = useState<Record<string,string|number>>({})
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

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
      setNodes(def.nodes?.map((n:any)=>( { id:n.id, type:n.type, x:n.position.x, y:n.position.y, cfg:n.config } )) || [])
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
      const definition = {
        nodes: nodes.map(n=>({id:n.id,type:n.type,position:{x:n.x,y:n.y},config:n.cfg})),
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
      if (n) setCfg({...n.cfg})
    }
  },[sel])

  const applyCfg = () => {
    if (!sel) return
    setNodes(ns => ns.map(n => n.id===sel ? {...n,cfg:{...cfg}} : n))
  }

  const deleteNode = (id:string) => {
    setNodes(ns=>ns.filter(n=>n.id!==id))
    setConns(cs=>cs.filter(c=>c.from!==id&&c.to!==id))
    if (sel===id) setSel(null)
  }

  const onCanvasMouseDown = (e:React.MouseEvent) => {
    const target = e.target as HTMLElement
    const portEl = target.closest('[data-port]') as HTMLElement|null
    const nodeEl = target.closest('[data-nid]') as HTMLElement|null

    if (portEl) {
      e.preventDefault(); e.stopPropagation()
      if (portEl.dataset.port === 'out') {
        const p = cvPos(e.clientX, e.clientY)
        setWire({ fid: portEl.dataset.nid!, cx:p.x, cy:p.y })
      }
      return
    }
    if (nodeEl) {
      const id = nodeEl.dataset.nid!
      const n  = byId(id)!
      const p  = cvPos(e.clientX, e.clientY)
      setSel(id)
      setDrag({ id, sx:p.x, sy:p.y, ox:n.x, oy:n.y })
      e.preventDefault()
      return
    }
    setSel(null)
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
        <div style={{flex:1,overflow:'scroll',position:'relative',background:'#080b0f'}}>
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
              const isSel = node.id===sel
              const label = node.type === 'source_ingest' ? (node.cfg.source_name as string || 'Sorgente') : d.label
              return (
                <div key={node.id} data-nid={node.id}
                  style={{position:'absolute',left:node.x,top:node.y,width:NW,height:NH,
                    borderRadius:5,border:`1px solid ${isSel?color:'#232d3a'}`,
                    background:'#0f1318',cursor:'move',userSelect:'none',
                    boxShadow:isSel?`0 0 0 2px ${color}22`:'none',transition:'border-color .12s'}}
                >
                  <div style={{height:4,borderRadius:'4px 4px 0 0',background:color}}/>
                  <div style={{padding:'7px 10px 5px'}}>
                    <div style={{fontFamily:'var(--mono)',fontSize:11,fontWeight:500,color:'#dde6f0',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{label}</div>
                    <div style={{fontSize:10,color:'#3d5268',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',marginTop:3,fontFamily:'var(--mono)'}}>
                      {node.type === 'source_ingest' ? 'Ingest sincronizzato' : (Object.values(node.cfg).slice(0,2).filter(Boolean).join(' · ') || '—')}
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

        {/* CONFIG PANEL */}
        <div style={{width:214,background:'#0f1318',borderLeft:'1px solid #232d3a',overflowY:'auto',padding:12,flexShrink:0}}>
          {!selNode ? (
            <div style={{fontSize:11,color:'#3d5268',textAlign:'center',paddingTop:48,lineHeight:1.8}}>Seleziona un nodo<br/>per configurarlo</div>
          ) : (
            <>
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:11}}>
                <div style={{width:7,height:7,borderRadius:1.5,background:CAT_COLOR[selDef!.cat]}}/>
                <span style={{fontFamily:'var(--mono)',fontSize:11,color:'#dde6f0',fontWeight:500}}>{selNode.type === 'source_ingest' ? (selNode.cfg.source_name as string) : selDef!.label}</span>
              </div>
              
              {selNode.type === 'source_ingest' && (
                <div style={{fontSize:10,color:'#7a92aa',lineHeight:1.6,marginBottom:12,padding:8,background:'#161b23',borderRadius:3,border:'1px solid #232d3a'}}>
                  I parametri di questa sorgente sono gestiti nella sezione <strong>Sorgenti</strong>. Qualsiasi modifica apportata lì si rifletterà automaticamente in questo flusso.
                </div>
              )}

              {selDef!.fields.map(f=>(
                <div key={f.key} style={{marginBottom:9}}>
                  <label style={{display:'block',fontSize:9,color:'#3d5268',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:3}}>
                    {f.label}{f.type==='range'&&<span style={{color:'#00dfa0',marginLeft:4}}>{cfg[f.key]??50}</span>}
                  </label>
                  {f.type==='select' ? (
                    <select value={String(cfg[f.key]??'')} onChange={e=>setCfg(c=>({...c,[f.key]:e.target.value}))}
                      style={{width:'100%',background:'#161b23',border:'1px solid #2a3240',borderRadius:3,padding:'5px 7px',color:'#dde6f0',fontFamily:'var(--mono)',fontSize:10,outline:'none'}}>
                      {f.options?.map(o=><option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : f.type==='range' ? (
                    <input type="range" min={0} max={100} value={Number(cfg[f.key]??50)}
                      onChange={e=>setCfg(c=>({...c,[f.key]:Number(e.target.value)}))}
                      style={{width:'100%',accentColor:'#00dfa0',cursor:'pointer'}}/>
                  ) : (
                    <input type={f.type==='password'?'password':'text'} value={String(cfg[f.key]??'')}
                      placeholder={f.type==='password'?'••••':''}
                      onChange={e=>setCfg(c=>({...c,[f.key]:e.target.value}))}
                      style={{width:'100%',background:'#161b23',border:'1px solid #2a3240',borderRadius:3,padding:'5px 7px',color:'#dde6f0',fontFamily:'var(--mono)',fontSize:10,outline:'none'}}/>
                  )}
                </div>
              ))}
              {selDef!.fields.length > 0 && (
                <button onClick={applyCfg} style={{width:'100%',background:'rgba(0,223,160,.09)',border:'1px solid #00a872',borderRadius:3,padding:5,fontFamily:'var(--mono)',fontSize:10,color:'#00dfa0',cursor:'pointer',marginTop:6}}>Applica</button>
              )}
              <button onClick={()=>deleteNode(sel!)} style={{width:'100%',background:'transparent',border:'1px solid #2a3240',borderRadius:3,padding:5,fontFamily:'var(--mono)',fontSize:10,color:'#3d5268',cursor:'pointer',marginTop:5}}>Elimina nodo</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
