import React,{useEffect,useState} from 'react';
import {AVY_SCALE} from './cell-coverage.js';
import {insideGeometry} from './terrain-context.js';
export const DEFAULT_LAYERS={history:true,burns:true,severity:true,rain:false,wind:true,drainage:false};
const date=x=>x?new Date(x).toLocaleString():'Not supplied';
export function useOperationContext(domain,target,offline){
 const [avy,setAvy]=useState(null),[pyro,setPyro]=useState(null),[incidents,setIncidents]=useState(null),[rain,setRain]=useState(null),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 const lon=target?.[0],lat=target?.[1];
 useEffect(()=>{if(offline)return;const c=new AbortController();let active=true;
  async function load(){if(document.hidden)return;try{const r=await fetch(domain==='Avy'?'/api/avalanche':'/api/pyro?kind=incidents',{signal:c.signal,cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.detail||'Source unavailable');if(active){if(domain==='Avy')setAvy(d);else setIncidents(d);setError('');}}catch(e){if(active&&e.name!=='AbortError')setError(e.message);}}
  load();const timer=setInterval(load,300000);return()=>{active=false;clearInterval(timer);c.abort();};
 },[domain,offline,refresh]);
 useEffect(()=>{setPyro(null);setRain(null);if(domain!=='Pyro'||offline||!Number.isFinite(lat)||!Number.isFinite(lon))return;const c=new AbortController();let active=true;
  async function load(){if(document.hidden)return;await Promise.all([['/api/pyro',setPyro],['/api/rainfall',setRain]].map(async([url,set])=>{try{const r=await fetch(url+'?lat='+lat+'&lon='+lon,{signal:c.signal,cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.detail);if(active)set(d);}catch(e){if(active&&e.name!=='AbortError')setError(e.message);}}));}
  load();const timer=setInterval(load,300000);return()=>{active=false;c.abort();clearInterval(timer);};
 },[domain,lat,lon,offline,refresh]);
 return {avy,pyro,incidents,rain,error,refresh:()=>setRefresh(x=>x+1)};
}
export default function OperationContext({domain,data,selectedRegion,onRegion,onIncident,layers,setLayers,offline}){
 const regions=domain==='Avy'?data.avy?.regions||[]:data.pyro?.regions||[];
 const current=regions.find(r=>r.id===selectedRegion?.id)||selectedRegion;
 const a=current?.avalanche_rating;
 const ratingCurrent=a?.status==='current'&&Date.parse(a.valid_from)<=Date.now()&&Date.now()<Date.parse(a.valid_until);
 const surveyAreas=[...regions,...(data.pyro?.burns||[]),...(data.pyro?.history||[])];
 const incidents=data.incidents?.incidents||[],preferred=incidents.find(i=>/^slough canyon$/i.test(i.name));
 const samples=(data.rain?.samples||[]).filter(s=>(data.pyro?.burns||[]).some(b=>insideGeometry(s.point,b.geometry)));
 return <section className="operational-context"><div className="review-heading"><h2>{domain==='Avy'?'UAC regions':'Incident area'}</h2><button className="text-button" disabled={offline} onClick={data.refresh}>Refresh</button></div>
 {data.error&&<p role="status" className="feedback">{data.error}</p>}
 {domain==='Avy'?<><label htmlFor="uac-region">Forecast region</label><select id="uac-region" value={selectedRegion?.id||''} onChange={e=>onRegion(regions.find(r=>r.id===e.target.value)||null)}><option value="">Choose a UAC region</option>{regions.map(r=><option value={r.id} key={r.id}>{r.name}</option>)}</select>
 {current&&<><p className="regional-rating"><i style={{background:ratingCurrent?AVY_SCALE[a.level-1][1]:'#9ca3af'}}/>{ratingCurrent?AVY_SCALE[a.level-1][0]:'No current official rating'}</p><small>Valid {date(a?.valid_from)} → {date(a?.valid_until)}</small><p className="hint">Region-wide forecast. Survey coverage and terrain slope do not establish snow stability.</p><a className="source-link" href={current.source_url} target="_blank" rel="noreferrer">UAC forecast ↗</a></>}
 {!data.avy&&!data.error&&<p role="status">Loading published regions…</p>}<p className="hint">Select a region, then a local survey point inside it. Select individual H3 cells on the map to narrow the route.</p></>:
 <><label htmlFor="fire-incident">Utah wildfire reports</label><select id="fire-incident" value="" onChange={e=>{const i=incidents.find(i=>i.id===e.target.value);if(i)onIncident(i);}}><option value="">Select an incident</option>{incidents.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select>{preferred&&<button className="outline draft-button" onClick={()=>onIncident(preferred)}>Explore Slough Canyon</button>}
 {selectedRegion?.point&&<article className="incident-readback"><strong>{selectedRegion.name}</strong><p>{selectedRegion.acres===null?'Area unavailable':selectedRegion.acres.toLocaleString()+' acres'} · {selectedRegion.contained===null?'Containment unavailable':selectedRegion.contained+'% reported contained'}</p><small>Reported {date(selectedRegion.updatedAt)} · {selectedRegion.outAt?'Reported out '+date(selectedRegion.outAt):selectedRegion.reportedActive?'Listed as active candidate':'Activity unconfirmed'}</small></article>}
 {surveyAreas.length>0&&<><label htmlFor="fire-perimeter">Published survey boundary</label><select id="fire-perimeter" value={surveyAreas.some(r=>r.id===selectedRegion?.id)?selectedRegion.id:''} onChange={e=>onRegion(surveyAreas.find(r=>r.id===e.target.value)||null)}><option value="">Choose a perimeter or local cells</option>{surveyAreas.map(r=><option key={r.id} value={r.id}>{r.name}{r.kind==='burn'?' · MTBS burn':r.kind==='history'?' · historical perimeter':' · reported perimeter'}{r.year?' · '+r.year:''}</option>)}</select></>}
 <div className="layer-options">{Object.entries({history:'Historical perimeters',burns:'MTBS mapped burns',severity:'BAER burn severity',rain:'Past 24 h rainfall (QPE)',wind:'Wind animation',drainage:'Terrain downslope'}).map(([key,label])=><label key={key}><input type="checkbox" checked={layers[key]} onChange={e=>setLayers(v=>({...v,[key]:e.target.checked}))}/>{label}</label>)}</div>
 {data.pyro&&<p className="hint">{data.pyro.burns.length} mapped burn footprints · {data.pyro.severity.length} BAER severity polygons. {data.pyro.severity.length?'Severity describes published soil effects.':'No published severity returned here; perimeter color is not severity.'}</p>}
 {layers.rain&&<p className="hint">NOAA MRMS radar estimate · 1 km resolution · {data.rain?.fresh?'24 h ending '+date(data.rain.endAt):'Current estimate unavailable or stale'}.{samples.length>0?' '+samples.length+' samples inside mapped burns: '+Math.min(...samples.map(s=>s.millimetres)).toFixed(1)+'–'+Math.max(...samples.map(s=>s.millimetres)).toFixed(1)+' mm.':' No valid burn-overlap samples returned.'} This is precipitation, not a runoff forecast.</p>}
 {layers.drainage&&<p className="hint">Arrows show DEM-derived downhill direction at mission cells. No water volume, stream routing or debris-flow probability is calculated.</p>}
 {data.pyro?.warnings?.map(w=><p className="hint" key={w}>{w}.</p>)}{data.pyro?.truncated&&<p className="notice">Source geometry is limited. Narrow the area for more detail.</p>}
 </>}
 <small>Retrieved {date(domain==='Avy'?data.avy?.retrievedAt:data.pyro?.retrievedAt||data.incidents?.retrievedAt)}</small></section>;
}
