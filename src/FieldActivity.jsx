import React,{useEffect,useRef,useState} from 'react';
import {client,orgPath} from './client.js';
import {buildMissionCells,coverageSummary} from './cell-coverage.js';
import IntegrityStatus from './IntegrityStatus.jsx';
import {mapWind} from './weather-data.js';
import {Radio,MessageSquare} from 'lucide-react';

export function ReconResults({record,feed,weather,context,conditions}){
 const p=record?.runtime,result=p?.recon_results;
 if(!result)return null;
 const cells=buildMissionCells({runtimeCellIds:p.plan.cell_index?.cell_ids||[]}).cells;
 const rows=Object.fromEntries((feed.data?.coverage||[]).filter(r=>r.planId===p.mission_id&&r.revision===p.plan.revision).map(r=>[r.cellId,{...r,state:r.coveragePct===100?'complete':'scanning'}]));
 const summary=coverageSummary(cells,rows),wind=mapWind(weather),forecast=conditions?.avy?.regions?.find(r=>r.id==='uac:salt-lake'),rain=conditions?.rain;
 const qpe=rain?.fresh&&rain.samples?.length?rain.samples.map(s=>s.millimetres):[];
 return <section className="recon-results" aria-label="Recon Results"><h2>Recon Results</h2><strong>{result.status==='completed_simulation'?'Simulation completed · landed':result.status}</strong><p>{result.interpretation}</p><dl className="mission-facts"><div><dt>Survey cells</dt><dd>{cells.length} · {Math.round(cells.reduce((n,c)=>n+c.areaM2,0))} m²</dd></div><div><dt>Modelled coverage</dt><dd>{summary.coveragePct===null?'Unavailable':Math.round(summary.coveragePct)+'%'}</dd></div></dl><p>{result.follow_up}</p>{result.domain==='AvyTS'&&<p className="hint">UAC Salt Lake: {forecast?.avalanche_rating?.status==='current'?'issued danger level '+forecast.avalanche_rating.level+' · valid until '+new Date(forecast.avalanche_rating.valid_until).toLocaleString():'no current official danger rating available'}.</p>}{wind&&<p className="hint">Wind from {Math.round(wind.fromDegrees)}° · {wind.speedMps.toFixed(1)} m/s · {wind.label} · {new Date(wind.observedAt).toLocaleString()}.</p>}{result.domain==='PyroTS'&&<p className="hint">{conditions?.pyro&&!conditions.pyro.warnings?.includes('Current perimeter unavailable')?(conditions.pyro.regions?.length||0)+' published nearby perimeters':'Perimeter context unavailable'} · {conditions?.pyro&&!conditions.pyro.warnings?.includes('MTBS mapped burns unavailable')?(conditions.pyro.burns?.length||0)+' mapped burn footprints':'Burn context unavailable'}. {qpe.length?'Area 24 h QPE samples: '+Math.min(...qpe).toFixed(1)+'–'+Math.max(...qpe).toFixed(1)+' mm, ending '+new Date(rain.endAt).toLocaleString():'Current rainfall samples unavailable'}.</p>}{Number.isFinite(result.duration_seconds)&&<p className="hint">Observed flight: {result.duration_seconds.toFixed(1)} seconds.</p>}<p className="hint">{context?.name||'Selected context'}.</p><IntegrityStatus record={record}/><details><summary>Result sources &amp; provenance</summary><p>{result.model} · {p.mission_id} · revision {p.plan.revision}</p><p>{result.source_id?'Original source '+result.source_id:'No incoming report associated'}</p><p>{result.observation_id?'Observation '+result.observation_id:''}</p><ul>{cells.map(c=><li key={c.id}><code>{c.id}</code></li>)}</ul><p>Footprint coverage is a geometric model based on observed PX4 positions. It is not camera imagery, a hazard rating, containment, snow depth or a thermal finding.</p></details></section>;
}

export default function FieldActivity({org,session,offline,domain,context,onContext,source,onSource,site,onSite,cells,onQuick,review,feed,weather,conditions,simulatorStatus,login}){
 const [workspace,setWorkspace]=useState(null),[contexts,setContexts]=useState([]),[items,setItems]=useState([]),[error,setError]=useState(''),[notification,setNotification]=useState('');
 const seen=useRef(new Set()),booted=useRef(false);
 useEffect(()=>{let active=true;setItems([]);setWorkspace(null);setContexts([]);seen.current=new Set();booted.current=false;if(!org||!session?.user||offline)return;
  Promise.all([client.getWorkspace(org),client.request(orgPath(org)+'/simulations/demo-contexts')]).then(([w,c])=>{if(!active)return;setWorkspace(w);setContexts(c.items||[]);if(!w.sites.some(s=>s.id===site))onSite(w.sites[0]?.id||'');setError('');}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};
 },[org,session?.user?.id,offline]);
 useEffect(()=>{if(!org||!site||!session?.user||offline)return;let active=true,timer,loading=false;
  async function poll(){if(loading||document.hidden)return;loading=true;try{const d=await client.request(orgPath(org)+'/simulations/activity?site_id='+encodeURIComponent(site));if(!active)return;setItems(d.items);const incoming=d.items.find(x=>!seen.current.has(x.id));if(incoming&&booted.current)setNotification('New '+(incoming.source_kind==='radio'?'radio':'Photon')+' report');for(const x of d.items)seen.current.add(x.id);booted.current=true;setError('');}catch(e){if(active)setError(e.message);}finally{loading=false;}}
  poll();timer=setInterval(poll,5000);return()=>{active=false;clearInterval(timer);};
 },[org,site,session?.user?.id,offline]);
 const current=items.find(x=>x.id===source?.id)||source;
 useEffect(()=>{if(current&&current!==source)onSource(current);},[current]);
 const available=contexts.find(c=>c.domain===domain),request=current?.reconnaissance_request;
 const conflict=request?.context_conflict||request?.context_id&&request.context_id!==context?.id;
 const age=Date.now()-Date.parse(current?.received_at);
 const ready=!!request&&!conflict&&context&&cells.length>=1&&cells.length<=2&&age>=-5000&&age<=1800000;
 const locked=!!review?.runtime||!!review?.quickSurvey;
 const recent=items.filter(item=>Date.now()-Date.parse(item.received_at)<=1800000);
 const visibleItems=recent.length?recent:items.slice(0,3);
 function openReport(item){onSource(item);const known=!item.reconnaissance_request?.context_conflict&&contexts.find(c=>c.id===item.reconnaissance_request?.context_id);if(known&&known.id!==context?.id)onContext(known);}
 return <section className="field-activity"><h1>Field Activity <span className="live-indicator">{offline?'Offline':error?'Unavailable':'Live'}</span></h1><p className="activity-flow">Report <span>→</span> Satchy + map <span>→</span> Survey <span>→</span> Result</p>
 {!session?.user?<button className="primary draft-button" onClick={login}>Open workspace</button>:<>
 <p className="mobile-runtime-state">Simulator: {simulatorStatus}</p><p className="incoming-notice" role="status" aria-live="polite">{offline?'Offline · incoming reports paused':notification||'Radio + Photon · waiting for reports'}</p>
 <div className="activity-feed" role="group" aria-label="Incoming field reports">{visibleItems.slice(0,6).map(item=><button className={'activity-entry'+(item.id===current?.id?' active':'')} key={item.id} disabled={locked} aria-pressed={item.id===current?.id} onClick={()=>openReport(item)}><span className="activity-entry-meta"><strong>{item.source_kind==='radio'?<Radio size={14}/>:<MessageSquare size={14}/>} {item.source_kind==='radio'?'Radio':'Photon'}</strong><time dateTime={item.received_at}>{new Date(item.received_at).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</time></span><span className="activity-entry-message">{item.original||'Message has no readable text'}</span><small>{item.reconnaissance_request?'Observation + survey request':item.status==='processing'?'Satchy processing…':'View report'}</small></button>)}</div>
 {!items.length&&<p className="activity-empty">Incoming authorized reports appear here automatically. Send the short radio or Photon message.</p>}
 {current?<div className="activity-review"><h2>Report review</h2><blockquote className="field-message">{current.original}</blockquote><div className="satchy-response"><img src="/satchy.png" alt="Satchy"/><p>{current.satchy||'Satchy processing: '+current.status}</p></div><p className="hint">{request?.intents?.includes('log_observation')?'Observation saved · ':''}{request?'Survey requested':'No supported survey request yet'}</p></div>:<p className="hint">Click a report to see Satchy’s response and its mapped context.</p>}
 <div className="field-context"><span className="small-label">Survey location</span><button className="location-choice" disabled={!available||offline||locked} onClick={()=>onContext(context||available)}>{context?.name||available?.name||'Choose map area'}{!available?' · unavailable':''}</button>{workspace?.sites?.length>1&&<label>Authorized site<select value={site} disabled={locked} onChange={e=>onSite(e.target.value)}>{workspace.sites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}</div>
 <div className="field-cells"><strong>{cells.length} selected {cells.length===1?'cell':'cells'}</strong>{cells.map(id=><code key={id}>{id}</code>)}</div>
 {current&&age>1800000&&<p className="hint">This report is outside the current demo window. Receive a fresh report before preparing a mission.</p>}{conflict&&<p className="feedback" role="alert">The reported place conflicts with this location. Confirm the correct context or obtain a corrected report.</p>}
 {!review?.quickSurvey&&<button className="primary draft-button next-action" disabled={!ready||offline||locked} onClick={()=>onQuick(current)}>Review Quick Survey</button>}
 {!review?.quickSurvey&&<p className="hint">Use the highlighted cell · 30 m AGL · modelled RGB. Your approval is required before simulation.</p>}
 {current&&<details className="mission-detail"><summary>Source &amp; processing details</summary><p>{current.provenance}</p>{context?.source_note&&<p>{context.source_note}</p>}{context?.source_url&&<a href={context.source_url} target="_blank" rel="noreferrer">Location source</a>}<p>{new Date(current.received_at).toLocaleString()} · {current.status}</p><p>Reply: {current.delivery_state||'No phone reply requested'}. Provider acceptance is not delivery confirmation.</p><code>{current.id}</code></details>}
 </>}
 {error&&<p className="feedback" role="alert">{error}</p>}
 <ReconResults record={review} feed={feed} weather={weather} context={context} conditions={conditions}/>
 </section>;
}
