import React,{useEffect,useRef,useState} from 'react';
import {client,orgPath} from './client.js';
import {buildMissionCells,coverageSummary} from './cell-coverage.js';
import IntegrityStatus from './IntegrityStatus.jsx';
import {mapWind} from './weather-data.js';

export function ReconResults({record,feed,weather,context,conditions}){
 const p=record?.runtime,result=p?.recon_results;
 if(!result)return null;
 const cells=buildMissionCells({runtimeCellIds:p.plan.cell_index?.cell_ids||[]}).cells;
 const rows=Object.fromEntries((feed.data?.coverage||[]).filter(r=>r.planId===p.mission_id&&r.revision===p.plan.revision).map(r=>[r.cellId,{...r,state:r.coveragePct===100?'complete':'scanning'}]));
 const summary=coverageSummary(cells,rows),wind=mapWind(weather),forecast=conditions?.avy?.regions?.find(r=>r.id==='uac:salt-lake'),rain=conditions?.rain;
 const qpe=rain?.fresh&&rain.samples?.length?rain.samples.map(s=>s.millimetres):[];
 return <section className="recon-results" aria-label="Recon Results"><h2>Recon Results</h2><strong>{result.status==='completed_simulation'?'Simulation completed · landed':result.status}</strong><p>{result.interpretation}</p><dl className="mission-facts"><div><dt>Survey cells</dt><dd>{cells.length} · {Math.round(cells.reduce((n,c)=>n+c.areaM2,0))} m²</dd></div><div><dt>Modelled coverage</dt><dd>{summary.coveragePct===null?'Unavailable':Math.round(summary.coveragePct)+'%'}</dd></div></dl><p>{result.follow_up}</p>{result.domain==='AvyTS'&&<p className="hint">UAC Salt Lake: {forecast?.avalanche_rating?.status==='current'?'issued danger level '+forecast.avalanche_rating.level+' · valid until '+new Date(forecast.avalanche_rating.valid_until).toLocaleString():'no current official danger rating available'}.</p>}{wind&&<p className="hint">Wind from {Math.round(wind.fromDegrees)}° · {wind.speedMps.toFixed(1)} m/s · {wind.label} · {new Date(wind.observedAt).toLocaleString()}.</p>}{result.domain==='PyroTS'&&<p className="hint">{conditions?.pyro&&!conditions.pyro.warnings?.includes('Current perimeter unavailable')?(conditions.pyro.regions?.length||0)+' published nearby perimeters':'Perimeter context unavailable'} · {conditions?.pyro&&!conditions.pyro.warnings?.includes('MTBS mapped burns unavailable')?(conditions.pyro.burns?.length||0)+' mapped burn footprints':'Burn context unavailable'}. {qpe.length?'Area 24 h QPE samples: '+Math.min(...qpe).toFixed(1)+'–'+Math.max(...qpe).toFixed(1)+' mm, ending '+new Date(rain.endAt).toLocaleString():'Current rainfall samples unavailable'}.</p>}{Number.isFinite(result.duration_seconds)&&<p className="hint">Observed flight: {result.duration_seconds.toFixed(1)} seconds.</p>}<p className="hint">{context?.name||'Selected context'}.</p><IntegrityStatus record={record}/><details><summary>Result sources &amp; provenance</summary><p>{result.model} · {p.mission_id} · revision {p.plan.revision}</p><p>{result.source_id?'Original source '+result.source_id:'No incoming report associated'}</p><p>{result.observation_id?'Observation '+result.observation_id:''}</p><ul>{cells.map(c=><li key={c.id}><code>{c.id}</code></li>)}</ul><p>Footprint coverage is a geometric model based on observed PX4 positions. It is not camera imagery, a hazard rating, containment, snow depth or a thermal finding.</p></details></section>;
}

export default function FieldActivity({org,session,offline,domain,context,onContext,source,onSource,site,onSite,cells,confirmed,onConfirm,onQuick,review,feed,weather,conditions,login}){
 const [workspace,setWorkspace]=useState(null),[contexts,setContexts]=useState([]),[items,setItems]=useState([]),[error,setError]=useState(''),[notification,setNotification]=useState('');
 const seen=useRef(new Set()),booted=useRef(false),selectionRef=useRef({});selectionRef.current={source,context,review,onSource};
 useEffect(()=>{let active=true;setItems([]);setWorkspace(null);setContexts([]);seen.current=new Set();booted.current=false;if(!org||!session?.user||offline)return;
  Promise.all([client.getWorkspace(org),client.request(orgPath(org)+'/simulations/demo-contexts')]).then(([w,c])=>{if(!active)return;setWorkspace(w);setContexts(c.items||[]);if(!w.sites.some(s=>s.id===site))onSite(w.sites[0]?.id||'');setError('');}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};
 },[org,session?.user?.id,offline]);
 useEffect(()=>{if(!org||!site||!session?.user||offline)return;let active=true,timer,loading=false;
  async function poll(){if(loading||document.hidden)return;loading=true;try{const d=await client.request(orgPath(org)+'/simulations/activity?site_id='+encodeURIComponent(site));if(!active)return;setItems(d.items);const incoming=d.items.find(x=>!seen.current.has(x.id));if(incoming&&booted.current)setNotification('Incoming '+incoming.source_kind+' report');for(const x of d.items)seen.current.add(x.id);const current=selectionRef.current,candidate=d.items.find(x=>x.reconnaissance_request?.context_id===current.context?.id&&Date.now()-Date.parse(x.received_at)<1800000);if(candidate&&!current.review?.quickSurvey&&candidate.id!==current.source?.id)current.onSource(candidate);booted.current=true;setError('');}catch(e){if(active)setError(e.message);}finally{loading=false;}}
  poll();timer=setInterval(poll,5000);return()=>{active=false;clearInterval(timer);};
 },[org,site,session?.user?.id,offline]);
 const current=items.find(x=>x.id===source?.id)||source;
 useEffect(()=>{if(current&&current!==source)onSource(current);},[current]);
 const available=contexts.find(c=>c.domain===domain),request=current?.reconnaissance_request;
 const conflict=request?.context_conflict||request?.context_id&&request.context_id!==context?.id;
 const age=Date.now()-Date.parse(current?.received_at);
 const ready=!!request&&!conflict&&context&&cells.length>=1&&cells.length<=2&&age>=-5000&&age<=1800000;
 return <section className="field-activity"><h1>Field Activity</h1><p className="activity-flow">Incoming <span>→</span> Satchy <span>→</span> Location <span>→</span> Mission <span>→</span> Result</p>
 {!session?.user?<button className="primary draft-button" onClick={login}>Open workspace</button>:<>
 <div className="field-context"><span className="small-label">Location</span><button className="outline draft-button" disabled={!available||offline||!!review?.quickSurvey} onClick={()=>onContext(available)}>{context&&available&&context.id===available.id?'✓ ':''}{domain==='Avy'?'Alta · Salt Lake UAC':'Slough Canyon'}{!available?' · source unavailable':''}</button>{workspace?.sites?.length>1?<label>Authorized site<select value={site} disabled={!!review?.runtime} onChange={e=>onSite(e.target.value)}>{workspace.sites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>:workspace?.sites?.length===1&&<small>{workspace.sites[0].name}</small>}</div>
 <p className="incoming-notice" role="status" aria-live="polite">{notification||'Listening for authorized radio and verified Photon reports'}</p>
 <label htmlFor="field-source">Incoming report</label><select id="field-source" value={current?.id||''} disabled={!!review?.runtime} onChange={e=>onSource(items.find(x=>x.id===e.target.value)||null)}><option value="">Choose a received report</option>{items.map(x=><option key={x.id} value={x.id}>{x.source_kind==='radio'?'Radio':'Photon'} · {new Date(x.received_at).toLocaleTimeString()} · {x.original.slice(0,55)}</option>)}</select>
 {current?<><blockquote className="field-message">{current.original}</blockquote><div className="satchy-response"><img src="/satchy.png" alt="Satchy"/><p>{current.satchy||'Satchy processing: '+current.status}</p></div><p className="hint">{request?.intents?.includes('log_observation')?'Observation retained · ':''}{request?'Survey request awaits map confirmation':'No supported reconnaissance request available yet'}</p></>:<p className="hint">Send the short radio or phone report. Its original message will appear here.</p>}
 <div className="field-cells"><strong>{cells.length} selected {cells.length===1?'cell':'cells'}</strong><small>{context?.name||'Choose the demo location, then select one or two map cells.'}</small>{cells.map(id=><code key={id}>{id}</code>)}</div>
 {current&&age>1800000&&<p className="hint">This report is outside the current demo window. Receive a fresh report before preparing a mission.</p>}{conflict&&<p className="feedback" role="alert">The reported place conflicts with this location. Confirm the correct context or obtain a corrected report.</p>}
 <button className="outline draft-button" disabled={!ready||offline||!!review?.runtime} onClick={()=>onConfirm(current)}>{confirmed?'✓ Selected cells confirmed':'Use selected cells'}</button>
 {!review?.quickSurvey&&<button className="primary draft-button" disabled={!confirmed||!ready||offline} onClick={()=>onQuick(current)}>Quick Survey</button>}
 <p className="hint">One-cell default · optional second cell · 30 m AGL · modelled RGB footprint. Review the exact plan before simulation.</p>
 {current&&<details className="mission-detail"><summary>Source &amp; processing details</summary><p>{current.provenance}</p><p>{new Date(current.received_at).toLocaleString()} · {current.status}</p><p>Reply: {current.delivery_state||'No phone reply requested'}. Provider acceptance is not delivery confirmation.</p><code>{current.id}</code></details>}
 </>}
 {error&&<p className="feedback" role="alert">{error}</p>}
 <ReconResults record={review} feed={feed} weather={weather} context={context} conditions={conditions}/>
 </section>;
}
