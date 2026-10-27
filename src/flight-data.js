// Shared decoder for genuine native telemetry and the staged authenticated broker.
export const PX4_REVISION='d6f12ad1c4f70ad3230afd7d86e971421e02fef4';
export const UUID_RE=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const numeric=(x,min=-Infinity,max=Infinity)=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max?x:null;
export function decodeSamples(rows,{legacyBattery=false,now=Date.now()}={}){
 if(!Array.isArray(rows)||rows.length>300)throw Error('Expected at most 300 telemetry samples.');
 let previous=-Infinity;
 return rows.map(r=>{
  if(!r||typeof r.sampled_at!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(r.sampled_at))throw Error('Telemetry needs a timezone-aware sample time.');
  const time=Date.parse(r.sampled_at);if(!Number.isFinite(time)||time<=previous||time>now+5000)throw Error('Invalid or unordered telemetry sample time.');previous=time;
  return {time,sampled_at:r.sampled_at,latitude_deg:numeric(r.latitude_deg,-90,90),longitude_deg:numeric(r.longitude_deg,-180,180),relative_altitude_m:numeric(r.relative_altitude_m),ground_speed_m_s:numeric(r.ground_speed_m_s,0),battery_remaining_fraction:legacyBattery?null:numeric(r.battery_remaining_fraction,0,1),flight_mode:typeof r.flight_mode==='string'?r.flight_mode.slice(0,64):null,armed:typeof r.armed==='boolean'?r.armed:null,in_air:typeof r.in_air==='boolean'?r.in_air:null,connected:r.connected!==false&&r.stale!==true,stale:r.stale===true};
 });
}
export function positionValid(s){return !!s&&Number.isFinite(s.longitude_deg)&&Number.isFinite(s.latitude_deg);}
export function frameAt(samples,time,{interpolate=true}={}){
 let index=-1;for(let i=0;i<samples.length&&samples[i].time<=time;i++)index=i;
 if(index<0)return null;
 const a=samples[index],b=samples[index+1],out={...a,interpolated:false};
 if(interpolate&&b&&a.connected&&b.connected&&b.time-a.time<=3000&&time>a.time){
  const ratio=Math.min(1,(time-a.time)/(b.time-a.time));
  for(const key of ['longitude_deg','latitude_deg','relative_altitude_m','ground_speed_m_s']){
   if(Number.isFinite(a[key])&&Number.isFinite(b[key]))out[key]=a[key]+(b[key]-a[key])*ratio;
  }
  out.interpolated=true;
 }
 return out;
}
export function flightConnected(data,now=Date.now()){
 const last=data?.samples?.at(-1);
 return data?.mode==='live'&&data.connected===true&&data.stale!==true&&!!last&&last.connected&&now-last.time>=-5000&&now-last.time<=3000;
}
// A current gateway response and fresh flight observations are separate facts.
// Delayed observations never satisfy the 3 s live/control freshness budget.
export const FEED_RESPONSE_TIMEOUT_MS=10000;
export function flightConnectionState(data,now=Date.now()){
 if(!data)return 'waiting';
 if(data.mode!=='live')return 'recorded';
 const receiptAge=now-data.receivedAt;
 if(data.connected!==true||!Number.isFinite(receiptAge)||receiptAge<0||receiptAge>FEED_RESPONSE_TIMEOUT_MS)return 'disconnected';
 return flightConnected(data,now)?'live':'delayed';
}
export const FLIGHT_CONNECTION_LABELS={idle:'Simulator not monitored',waiting:'Connecting simulator…',live:'PX4 connected',delayed:'PX4 connected · telemetry delayed',disconnected:'Simulator disconnected',recorded:'Recorded PX4 flight',offline:'Offline · telemetry unavailable'};
export function observedTrack(samples,time=Infinity){
 const features=[];let segment=[],previous=null;
 const flush=()=>{if(segment.length>=2)features.push({type:'Feature',properties:{source:'PX4/Gazebo SITL'},geometry:{type:'LineString',coordinates:segment}});segment=[];};
 for(const s of samples){
  if(s.time>time)break;
  if(!s.connected||!positionValid(s)){flush();previous=null;continue;}
  if(previous&&s.time-previous.time>3000)flush();
  segment.push([s.longitude_deg,s.latitude_deg]);previous=s;
 }
 flush();return {type:'FeatureCollection',features};
}
export function decodeNativePacket(packet,now=Date.now()){
 if(packet?.schema!=='terrasatch.native-flight.v1'||packet.source!=='PX4/Gazebo SITL'||packet.px4_revision!==PX4_REVISION||typeof packet.run_id!=='string'||!/^native-evidence-\d{8}T\d{12}Z$/.test(packet.run_id))throw Error('Unexpected native flight source.');
 const manifest=decodeMissionManifest(packet);
 return {manifest,qaOnly:packet.qa_only===true,key:'native:'+packet.run_id,runId:packet.run_id,mode:packet.mode==='live'?'live':'recorded',source:packet.source,samples:decodeSamples(packet.samples,{legacyBattery:packet.legacy_battery_units===true,now}),connected:packet.connected===true,stale:packet.stale!==false,result:packet.result&&typeof packet.result==='object'?{status:['passed','failed'].includes(packet.result.status)?packet.result.status:'unknown',airborne_observed:packet.result.airborne_observed===true,landing_observed:packet.result.landing_observed===true,disarmed_observed:packet.result.disarmed_observed===true,max_observed_relative_altitude_m:numeric(packet.result.max_observed_relative_altitude_m)}:null,planId:UUID_RE.test(packet.mission?.plan_id||'')?packet.mission.plan_id:null,missionId:UUID_RE.test(packet.mission?.id||'')?packet.mission.id:null,missionRevision:Number.isSafeInteger(packet.mission?.revision)?packet.mission.revision:null,coverage:Array.isArray(packet.coverage)&&packet.coverage.length<=120?packet.coverage:[],payloadStatus:packet.coverage?.some(r=>r.model?.kind==='modeled_rgb')?'Modelled 60° nadir footprint derived from observed telemetry. No camera images or measured snow/fire data.':'No sensor payload was verified for this flight.',legacyBattery:packet.legacy_battery_units===true};
}

export function decodeMissionManifest(packet){
 const p=packet?.mission_manifest,m=packet?.mission;
 if(!p)return null;
 if(p.schema!=='terrasatch.simulation-mission.v1'||p.environment!=='simulation'||p.request_id!==m?.id||p.id!==m?.plan_id||p.revision!==m?.revision||p.content_hash!==m?.content_hash||!UUID_RE.test(p.request_id)||!UUID_RE.test(p.id)||!Array.isArray(p.waypoints)||p.waypoints.length>100)throw Error('Runtime mission manifest does not match its observed mission.');
 if(p.waypoints.some(w=>!Number.isFinite(w.latitude_deg)||!Number.isFinite(w.longitude_deg)||!Number.isFinite(w.relative_altitude_m)||Math.abs(w.latitude_deg)>90||Math.abs(w.longitude_deg)>180))throw Error('Invalid runtime waypoint.');
 return {id:p.id,request_id:p.request_id,revision:p.revision,waypoints:p.waypoints,cell_index:p.cell_index,content_hash:p.content_hash,payload:p.payload};
}
