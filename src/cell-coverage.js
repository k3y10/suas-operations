import {slopeColor} from './terrain-context.js';
import {isValidCell,getResolution,cellToBoundary,cellToLatLng,cellArea,getHexagonAreaAvg,polygonToCellsExperimental,POLYGON_TO_CELLS_FLAGS,UNITS} from 'h3-js';
export const MAX_CELLS=120, MAX_LOG_BYTES=512*1024, STALE_MS=30000;
export const COVERAGE_COLORS={unknown:'#94a3b8',queued:'#94a3b8',scanning:'#f5a623',complete:'#34b879',review:'#f5a623'};
export const MEASUREMENTS={surface_temperature_c:{label:'Surface temperature',unit:'°C'},image_count:{label:'Images',unit:'frames'},lidar_points_per_m2:{label:'LiDAR density',unit:'points/m²'},snow_depth_m:{label:'Snow depth',unit:'m'}};
export const AVY_SCALE=[['Low','#50B848'],['Moderate','#FFF200'],['Considerable','#F7941E'],['High','#ED1C24'],['Extreme','#231F20']];
export function buildMissionCells(plan){
 if(!plan)return {cells:[],resolution:null};
 if(Array.isArray(plan.runtimeCellIds)){
  const ids=plan.runtimeCellIds;
  if(!ids.length)return {cells:[],resolution:null};
  if(ids.length>MAX_CELLS||new Set(ids).size!==ids.length||ids.some(i=>!isValidCell(i)))throw Error('Invalid approved H3 index.');
  const resolution=getResolution(ids[0]);if(resolution<8||resolution>13||ids.some(i=>getResolution(i)!==resolution))throw Error('Mixed H3 resolutions.');
  return {resolution,cells:ids.map((id,i)=>{const [lat,lng]=cellToLatLng(id);return {id,alias:'H'+String(i+1).padStart(2,'0'),center:[lng,lat],areaM2:cellArea(id,UNITS.m2),geometry:{type:'Polygon',coordinates:[cellToBoundary(id,true)]}};})};
 }
 const ring=plan.geometry?.features?.find(f=>f.properties?.kind==='boundary')?.geometry?.coordinates?.[0];
 if(!ring||ring.length!==5||ring.some(p=>p.length!==2||!p.every(Number.isFinite)||Math.abs(p[0])>180||Math.abs(p[1])>80))throw Error('Unsupported mission boundary.');
 const lons=ring.map(p=>p[0]),lats=ring.map(p=>p[1]), lat=(Math.max(...lats)+Math.min(...lats))/2;
 const width=(Math.max(...lons)-Math.min(...lons))*111320*Math.cos(lat*Math.PI/180), height=(Math.max(...lats)-Math.min(...lats))*111320;
 if(width<50||height<50||width>2000||height>2000)throw Error('Cell indexing supports bounded local survey areas only.');
 let resolution=13;
 while(resolution>8&&width*height/getHexagonAreaAvg(resolution,UNITS.m2)>45)resolution--;
 let ids=polygonToCellsExperimental([ring],resolution,POLYGON_TO_CELLS_FLAGS.containmentFull,true).sort();
 if(ids.length>MAX_CELLS)throw Error('Cell budget exceeded. Narrow the mission area.');
 if(!ids.length)throw Error('No complete H3 cells fit inside this survey.');
 return {resolution,cells:ids.map((id,i)=>{const [lat,lng]=cellToLatLng(id);return {id,alias:'H'+String(i+1).padStart(2,'0'),center:[lng,lat],areaM2:cellArea(id,UNITS.m2),geometry:{type:'Polygon',coordinates:[cellToBoundary(id,true)]}};})};
}
export function parseCoverageLog(text){
 if(new TextEncoder().encode(text).length>MAX_LOG_BYTES)throw Error('Coverage log exceeds 512 KiB.');
 // Only complete lines from a live append-only log are read. Snapshot files may omit the final newline.
 const lines=text.split(/\r?\n/).filter(x=>x.trim());
 if(lines.length>2000)throw Error('Coverage log exceeds 2,000 records.');
 return lines.map((line,i)=>{try{return JSON.parse(line);}catch{throw Error('Invalid coverage record at line '+(i+1)+'.');}});
}
export function applyCoverage(previous,records,scope,now=Date.now()){
 if(!Array.isArray(records)||records.length>2000)throw Error('Coverage record budget exceeded.');
 const next={...previous},changes=[];let rejected=0;
 const ids=new Set(scope.cells.map(c=>c.id));
 for(const r of records){
  const time=typeof r?.observedAt==='string'&&/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(r.observedAt)?Date.parse(r.observedAt):NaN;
  const measurements=r?.measurements??{};
  const measured=measurements&&typeof measurements==='object'&&!Array.isArray(measurements)&&Object.keys(measurements).length<=4&&Object.entries(measurements).every(([key,value])=>Object.hasOwn(MEASUREMENTS,key)&&(value===null||typeof value==='number'&&Number.isFinite(value)));
  const valid=measured&&r?.schema==='terrasatch.cell-coverage.v1'&&r.planId===scope.planId&&r.revision===scope.revision&&ids.has(r.cellId)&&Number.isSafeInteger(r.sequence)&&r.sequence>=0&&Number.isFinite(time)&&time<=now+5000&&typeof r.coveragePct==='number'&&Number.isFinite(r.coveragePct)&&r.coveragePct>=0&&r.coveragePct<=100&&['accepted','review_required'].includes(r.quality)&&typeof r.sourceId==='string'&&r.sourceId.length>0&&r.sourceId.length<=120&&typeof r.evidenceId==='string'&&r.evidenceId.length>0&&r.evidenceId.length<=200;
  if(!valid){rejected++;continue;}
  const old=next[r.cellId];if(old&&r.sequence<=old.sequence)continue;
  if(old&&time<Date.parse(old.observedAt)){rejected++;continue;}
  const state=r.quality==='review_required'?'review':r.coveragePct===100?'complete':r.coveragePct===0?'queued':'scanning';
  next[r.cellId]={cellId:r.cellId,sequence:r.sequence,coveragePct:r.coveragePct,quality:r.quality,state,sourceId:r.sourceId,evidenceId:r.evidenceId,observedAt:r.observedAt,measurements:{...measurements}};
  if(!old||old.state!==state||JSON.stringify(old.measurements)!==JSON.stringify(measurements))changes.push({cellId:r.cellId,state:old&&old.state===state?'measurements_updated':state,observedAt:r.observedAt});
 }
 return {records:next,changes,rejected};
}
export function coverageSummary(cells,records){
 let knownArea=0,coveredArea=0,totalArea=0,complete=0,known=0;
 for(const c of cells){totalArea+=c.areaM2;const r=records[c.id];if(r){known++;knownArea+=c.areaM2;coveredArea+=c.areaM2*r.coveragePct/100;if(r.state==='complete')complete++;}}
 return {known,complete,total:cells.length,knownAreaM2:knownArea,coveragePct:known===cells.length&&totalArea>0?100*coveredArea/totalArea:null};
}
export function cellFeatures(cells,records,mode='coverage',context={}){
 return {type:'FeatureCollection',features:cells.map(c=>{
  const r=records[c.id],v=context[c.id];
  const color=mode==='terrain'?slopeColor(v?.terrain?.slopeDegrees):mode==='context'?(v?.rating?AVY_SCALE[v.rating.avalanche_rating.level-1][1]:v?.fire?.color||'#94a3b8'):COVERAGE_COLORS[r?.state||'unknown'];
  const known=mode==='terrain'?!!v?.terrain:!!(v?.rating||v?.fire);
  const opacity=mode==='coverage'?(r?.state==='complete'?.32:r?.state==='scanning'||r?.state==='review'?.3:.07):known?.3:.07;
  return {type:'Feature',id:c.id,geometry:c.geometry,properties:{id:c.id,alias:c.alias,color,opacity,label:c.alias+(mode==='coverage'&&r?' · '+Math.round(r.coveragePct)+'%':''),state:r?.state||'unknown'}};
 })};
}
export function regionFeatures(regions,domain,now=Date.now()){
 return {type:'FeatureCollection',features:regions.filter(r=>r.geometry).map(r=>{const a=r.avalanche_rating;const current=domain==='Avy'&&a?.status==='current'&&Number.isInteger(a.level)&&a.level>=1&&a.level<=5&&Date.parse(a.valid_from)<=now&&now<Date.parse(a.valid_until);return {type:'Feature',geometry:r.geometry,properties:{id:r.id,name:r.name,color:domain==='Pyro'?'#fb923c':current?AVY_SCALE[a.level-1][1]:'#9CA3AF',scope:domain==='Pyro'?'Published incident perimeter':current?'Issuer regional danger':'No current rating'}};})};
}

export function hexRoute(cells,start){
 const remaining=new Map(cells.map(c=>[c.id,c]));const ordered=[];let point=start;
 const distance=c=>{const dx=(c.center[0]-point[0])*Math.cos(point[1]*Math.PI/180);return dx*dx+(c.center[1]-point[1])**2;};
 while(remaining.size){const next=[...remaining.values()].sort((a,b)=>distance(a)-distance(b)||a.id.localeCompare(b.id))[0];ordered.push(next);remaining.delete(next.id);point=next.center;}
 return ordered;
}
