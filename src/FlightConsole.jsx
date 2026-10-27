import {useEffect,useMemo,useRef,useState} from 'react';
import recorded from './evidence/native-flight.json';
import {client,orgPath} from './client.js';
import {decodeNativePacket,decodeSamples,flightConnected,flightConnectionState,FLIGHT_CONNECTION_LABELS,frameAt,UUID_RE,normalizedFlightResult} from './flight-data.js';
export function useFlightFeed({org,signedIn,offline}){
 const [data,setData]=useState(null),[source,setSource]=useState(null),[error,setError]=useState(''),[playing,setPlaying]=useState(false),[cursor,setCursor]=useState(0),[clock,setClock]=useState(Date.now()),[focus,setFocus]=useState(0);
 const sourceRef=useRef(source);sourceRef.current=source;
 const loaded=useMemo(()=>decodeNativePacket(recorded),[]);
 function stop(){setSource(null);setData(null);setPlaying(false);setCursor(0);setError('');}
 function replay(){setSource({type:'replay'});setData(loaded);setCursor(loaded.samples[0].time);setPlaying(true);setError('');}
 function replayCaptured(){if(!data?.samples.length||data.mode!=='recorded')return;setSource({type:'replay'});setCursor(data.samples[0].time);setPlaying(true);setError('');}
 function local(id){setSource({type:'local',id:typeof id==='string'&&UUID_RE.test(id)?id:null});setData(null);setPlaying(false);setError('');}
 function mission(id){if(!UUID_RE.test(id)){setError('Enter a valid simulator mission ID.');return;}setSource({type:'api',id,org});setData(null);setPlaying(false);setError('');}
 useEffect(()=>{if(source?.type==='api'&&(!signedIn||source.org!==org)){stop();}},[org,signedIn,source]);
 useEffect(()=>{
  if(!source||source.type==='replay')return;
  let active=true,timer,controller,deadline,inFlight=false,finished=false;
  const cadence=source.type==='local'?1000:3000;
  async function poll(){
   if(!active||inFlight||finished)return;
   if(offline||document.visibilityState==='hidden'){timer=setTimeout(poll,cadence);return;}
   const started=performance.now();inFlight=true;controller=new AbortController();
   deadline=setTimeout(()=>controller.abort(),source.type==='local'?3000:8000);
   try{
    let next;
    if(source.type==='local'){
     const r=await fetch('/api/local-sitl',{cache:'no-store',signal:controller.signal});
     if(!(r.headers.get('content-type')||'').includes('application/json'))throw Error('Local PX4 monitoring is available only on the configured localhost preview.');
     const packet=await r.json();if(!r.ok)throw Error(packet.detail||'Local telemetry unavailable.');next=decodeNativePacket(packet);if(source.id&&next.missionId!==source.id)throw Error('Awaiting telemetry for the exact approved mission.');
    }else{
     const packet=await client.request(orgPath(source.org)+'/simulations/missions/'+source.id+'/telemetry?limit=300',{signal:controller.signal});
     packet.flight_result=normalizedFlightResult(packet.flight_result);
     next={key:'api:'+source.org+':'+source.id,runId:source.id,mode:['passed','failed'].includes(packet.flight_result?.status)?'recorded':'live',source:'Authenticated simulator API',samples:decodeSamples(packet.samples),connected:typeof packet.gateway_connected==='boolean'?packet.gateway_connected:packet.connected===true,stale:packet.stale!==false,result:packet.flight_result||null,manifest:packet.mission_plan||null,planId:packet.mission_plan?.id,missionId:source.id,missionRevision:packet.mission_plan?.revision,coverage:packet.coverage||[],payloadStatus:packet.coverage?.length?'Modelled 60° nadir footprint from actual PX4 telemetry; no sensor images or measurements.':'No sensor payload evidence is available.'};
    }
    if(active){const receivedAt=Date.now();setData({...next,receivedAt});setClock(receivedAt);setError('');}
    if(next.mode==='recorded'){finished=true;return;}
   }catch(e){if(active)setError(e.name==='AbortError'?'Telemetry request timed out; reconnecting…':e.message);}
   finally{clearTimeout(deadline);inFlight=false;}
   if(active)timer=setTimeout(poll,Math.max(0,cadence-(performance.now()-started)));
  }
  const resume=()=>{if(document.visibilityState==='visible'){clearTimeout(timer);poll();}};
  document.addEventListener('visibilitychange',resume);
  poll();return()=>{active=false;clearTimeout(timer);clearTimeout(deadline);controller?.abort();document.removeEventListener('visibilitychange',resume);};
 },[source,offline]);
 useEffect(()=>{if(!data)return;let last=performance.now();const timer=setInterval(()=>{const now=performance.now(),delta=now-last;last=now;setClock(Date.now());if(sourceRef.current?.type==='replay'&&playing)setCursor(t=>Math.min(data.samples.at(-1).time,t+delta));},100);return()=>clearInterval(timer);},[data,playing]);
 useEffect(()=>{if(source?.type==='replay'&&data&&cursor>=data.samples.at(-1).time)setPlaying(false);},[cursor,source,data]);
 const authorized=source?.type!=='api'||(signedIn&&source.org===org);
 const visibleData=authorized?data:null;
 const replaying=source?.type==='replay';
 const time=replaying?cursor:visibleData?.samples.length?Math.min(visibleData.samples.at(-1).time,clock-2000):undefined;
 const connection=!authorized||!source?'idle':offline?'offline':replaying?'recorded':flightConnectionState(visibleData,clock);
 const sampleAge=visibleData?.samples.length?Math.max(0,clock-visibleData.samples.at(-1).time):null;
 const frame=visibleData&&Number.isFinite(time)?frameAt(visibleData.samples,time,{interpolate:!matchMedia('(prefers-reduced-motion: reduce)').matches}):null;
 return {connection,connectionLabel:FLIGHT_CONNECTION_LABELS[connection],sampleAge,data:visibleData,source:authorized?source:null,error:authorized?error:'',playing,cursor,clock,frame,time,focus,locate:()=>setFocus(v=>v+1),live:authorized&&!offline&&flightConnected(visibleData,clock),replay,replayCaptured,local,mission,stop,seek:t=>{setPlaying(false);setCursor(Number(t));},toggle:()=>{if(data&&cursor>=data.samples.at(-1).time)setCursor(data.samples[0].time);setPlaying(p=>!p);},replaying};
}
export function FlightControls({feed,signedIn,offline,org}){
 const [missionId,setMissionId]=useState(''),[capability,setCapability]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{setMissionId('');setCapability('');},[org,signedIn]);
 async function check(){setBusy(true);try{const c=await client.request(orgPath(org)+'/simulations/capabilities');setCapability(c.enabled&&c.available?'Simulator provider reports available.':c.reason||'Simulator unavailable.');}catch(e){setCapability(e.status===404?'Simulator API is not deployed on this backend.':e.message);}finally{setBusy(false);}}
 return <section className='flight-controls'><h2>Flight view</h2><p className='hint'>Monitor the mission at its real map coordinates. Prepare and approve new missions from the selected satellite area.</p><details className='mission-detail'><summary>Historical QA recording</summary><button className='outline draft-button' onClick={feed.replay}>Play verified PX4 flight</button><p className='hint'>Original flight coordinates and date; this recording is not the selected mission.</p></details><button className='outline draft-button' onClick={feed.local} disabled={offline}>Watch local PX4</button><p className='hint'>Local monitoring reads the reusable runtime. PX4 stays inside the isolated simulator.</p><details className='mission-detail'><summary>Authenticated simulator feed</summary><button className='outline' disabled={!signedIn||offline||busy||!org} onClick={check}>{busy?'Checking…':'Check simulator API'}</button>{capability&&<p role='status'>{capability}</p>}<label htmlFor='sim-mission-id'>Existing simulator mission ID</label><input id='sim-mission-id' value={missionId} maxLength={36} onChange={e=>setMissionId(e.target.value)} placeholder='UUID from the simulator session'/><button className='outline draft-button' disabled={!signedIn||offline||!org||!UUID_RE.test(missionId)} onClick={()=>feed.mission(missionId)}>Monitor authorized mission</button><p className='hint'>Uses your existing workspace session. A monitor connection does not create or approve a mission.</p></details>{feed.source&&<button className='text-button draft-button' onClick={feed.stop}>Close flight view</button>}{feed.error&&<p className='feedback' role='alert'>{feed.error}</p>}</section>;
}
export function FlightHUD({feed}){
 if(!feed.source)return null;
 const d=feed.data,s=feed.frame,fmt=(v,unit)=>Number.isFinite(v)?v.toFixed(1)+' '+unit:'Unknown';
 const max=Math.max(6,...(d?.samples||[]).map(x=>x.relative_altitude_m||0)),height=Number.isFinite(s?.relative_altitude_m)?Math.max(0,Math.min(1,s.relative_altitude_m/max)):null;
 return <section className='flight-hud' aria-label='Genuine simulator flight'><div className='flight-hud-heading'><strong>{feed.replaying?'RECORDED PX4 FLIGHT':feed.connection==='recorded'?'CAPTURED PX4 FLIGHT':feed.live?'LIVE SIMULATOR':feed.connection==='delayed'?'SIMULATOR · TELEMETRY DELAYED':feed.connection==='waiting'?'SIMULATOR · CONNECTING':'SIMULATOR · DISCONNECTED'}</strong><button className='text-button' disabled={!s||!Number.isFinite(s.latitude_deg)||!Number.isFinite(s.longitude_deg)} onClick={feed.locate}>Locate</button><button className='text-button' onClick={feed.stop} aria-label='Close flight view'>Close</button></div>{d?<><small>{d.runId}{feed.source?.type==='local'?' · local runtime evidence':d.qaOnly?' · isolated QA fixture':''}</small><div className='flight-readings'><div><span>Altitude · relative</span><strong>{fmt(s?.relative_altitude_m,'m')}</strong></div><div><span>Ground speed</span><strong>{fmt(s?.ground_speed_m_s,'m/s')}</strong></div><div><span>Flight mode</span><strong>{s?.flight_mode||'Unknown'}</strong></div></div><details className='flight-evidence altitude-detail'><summary>Altitude profile</summary><div className='flight-profile' aria-label='Relative altitude profile'><span className='altitude-top'>{max.toFixed(0)} m</span><span className='altitude-ground'>0 m</span>{height!==null&&<div className='profile-drone' style={{bottom:(height*65+5)+'%'}}><svg viewBox='0 0 48 24' aria-hidden='true'><path d='M16 12h16M24 8v10M16 12 9 5M32 12l7-7M16 12l-7 7M32 12l7 7'/><ellipse cx='8' cy='4' rx='7' ry='2'/><ellipse cx='40' cy='4' rx='7' ry='2'/><ellipse cx='8' cy='20' rx='7' ry='2'/><ellipse cx='40' cy='20' rx='7' ry='2'/></svg><span>{fmt(s.relative_altitude_m,'m')}</span></div>}<small>Altitude profile · separate from map scale</small></div></details>{feed.replaying&&<div className='playback-controls'><button className='outline' onClick={feed.toggle}>{feed.playing?'Pause':'Play'}</button><input type='range' aria-label='Recorded flight time' min={d.samples[0].time} max={d.samples.at(-1).time} step={100} value={feed.cursor} onChange={e=>feed.seek(e.target.value)}/><span>{Math.max(0,(feed.cursor-d.samples[0].time)/1000).toFixed(1)} s</span></div>}{!feed.replaying&&d.mode==='recorded'&&d.samples.length>0&&<button className='outline captured-replay' onClick={feed.replayCaptured}>Replay this captured run</button>}<p>{d.coverage?.length?'Payload model: RGB footprint · no camera images':'Sensor payload: none verified for this view.'}</p><details className='flight-evidence'><summary>Source &amp; payload details</summary><p className='flight-source'>{s?new Date(s.sampled_at).toISOString():'Waiting for position'} · {d.source}{s?.interpolated?' · interpolated between observations':''}</p><p>Map drone glyph marks the observed ground position; it is not drawn to aircraft dimensions.</p><p>{d.payloadStatus}</p><p className='flight-source'>Battery: {Number.isFinite(s?.battery_remaining_fraction)?(s.battery_remaining_fraction*100).toFixed(0)+'%':'Unknown'} · armed: {s?.armed===null||s?.armed===undefined?'Unknown':s.armed?'yes':'no'} · airborne: {s?.in_air===null||s?.in_air===undefined?'Unknown':s.in_air?'yes':'no'}.</p>{d.result&&<p className='flight-source'>Recorded result: {d.result.status}. Airborne: {d.result.airborne_observed?'observed':'unverified'} · landed: {d.result.landing_observed?'observed':'unverified'} · disarmed: {d.result.disarmed_observed?'observed in result/log':'unverified'}.</p>}{d.legacyBattery&&<p className='flight-source'>Battery: Unknown · original recorder used incorrect units.</p>}</details>{!feed.replaying&&!feed.live&&<p className='notice'>{feed.connection==='delayed'?'Gateway connected; telemetry delayed.':feed.connection==='recorded'?'Captured run has ended.':'No current simulator connection.'} Last observation retained{Number.isFinite(feed.sampleAge)?' · '+(feed.sampleAge/1000).toFixed(1)+' s old':''}. Flight data over 3 seconds old is not live.</p>}</>:<p>Waiting for genuine telemetry…</p>}{feed.error&&<p className='feedback' role='alert'>{feed.error}</p>}</section>;
}
