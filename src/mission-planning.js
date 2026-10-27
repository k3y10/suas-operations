import { createDraft } from './drafts.js';
import { buildMissionCells, hexRoute } from './cell-coverage.js';
import { cellInGeometry } from './operation-geometry.js';
export const SCENARIOS = [
  {id:'snow-survey', domain:'Avy', name:'Same-day snow survey', description:'Pair a field snowpit with aerial surface mapping.', payload:'RGB mapping', output:'Georeferenced surface imagery linked to a dated, located snowpit observation.', limit:'A snowpit describes one location. RGB imagery cannot measure buried weak layers or establish stability across a zone.'},
  {id:'storm-change', domain:'Avy', name:'Post-storm surface mapping', description:'Document surface changes for a forecaster to review.', payload:'RGB mapping', output:'Repeat imagery of visible drifts, cornices and avalanche debris.', limit:'Surface change is supporting evidence, not an automatic avalanche safety assessment.'},
  {id:'hotspots', domain:'Pyro', name:'Thermal hotspot verification', description:'Help crews investigate suspected heat sources.', payload:'RGB + radiometric thermal', output:'Geolocated suspected hotspots with uncertainty and crew verification.', limit:'Thermal readings need calibration and ground verification. Incident air operations must coordinate the mission.'},
  {id:'crew-recon', domain:'Pyro', name:'Crew reconnaissance', description:'Survey access and incident boundaries with the crew.', payload:'RGB; optional thermal', output:'Imagery and candidate observations for incident command review.', limit:'Smoke, vegetation and terrain can obscure hazards. No suppression, ignition or payload release is enabled.'},
];
export const READINESS = ['Validated drone, firmware and payload adapter', 'Assigned remote pilot in command', 'Airspace, TFRs and required FAA permissions', 'Weather, battery, VLOS and terrain clearance', 'Human approval bound to this plan revision'];
export function createSurveyPlan({scenarioId, target, altitude, width, observation=null, region=null, selectedCellIds=[]}) {
  const scenario=SCENARIOS.find(s=>s.id===scenarioId);
  if (!scenario) throw Error('Choose a supported scenario.');
  if (!Array.isArray(target) || target.length!==2 || !target.every(Number.isFinite) || Math.abs(target[0])>180 || Math.abs(target[1])>80) throw Error('Select a valid map point between 80°S and 80°N.');
  const a=Number(altitude), w=Number(width);
  if (!Number.isFinite(a)||a<10||a>120) throw Error('Draft altitude must be 10–120 m AGL. Actual limits require review.');
  if (!Number.isFinite(w)||w<100||w>1000) throw Error('Survey width must be 100–1000 m.');
  const dy=w/2/111320, dx=dy/Math.cos(target[1]*Math.PI/180);
  const [lng,lat]=target;
  if (Math.abs(lng)+dx>180 || Math.abs(lat)+dy>80) throw Error('Survey boundary crosses supported map limits.');
  const point=(x,y)=>[Number((lng+x*dx).toFixed(7)),Number((lat+y*dy).toFixed(7))];
  const rows=Math.ceil(w/50), route=[];
  for(let i=0;i<=rows;i++){const y=-1+2*i/rows; route.push(point(i%2?1:-1,y),point(i%2?-1:1,y));}
  const boundary=[point(-1,-1),point(1,-1),point(1,1),point(-1,1),point(-1,-1)];
  const draft=createDraft(scenario.name,scenario.domain,target);
  const record = {...draft, plan:{revision:1, environment:'simulation', scenarioId, payloadRequirement:scenario.payload, altitudeIntent:{metres:a,reference:'AGL',terrainValidated:false}, widthMetres:w, lineSpacingMetres:50, launchLocation:null,recoveryLocation:null, approval:null, dispatched:false, observation:observation?{filename:String(observation.filename||'').slice(0,255),observedAtLocal:String(observation.observedAtLocal||'').slice(0,30),timeZone:String(observation.timeZone).slice(0,80),uploadStatus:'not_uploaded'}:null, geometry:{type:'FeatureCollection',features:[{type:'Feature',properties:{kind:'boundary'},geometry:{type:'Polygon',coordinates:[boundary]}},{type:'Feature',properties:{kind:'path'},geometry:{type:'LineString',coordinates:route}}]}}};
  const index=buildMissionCells(record.plan);
  const eligible=index.cells.filter(c=>cellInGeometry(c,region?.geometry));
  if(!eligible.length)throw Error('No complete survey cells fit the selected boundary. Choose a point farther inside it.');
  if(selectedCellIds.some(id=>!eligible.some(c=>c.id===id)))throw Error('Selected cells no longer belong to this survey. Select the area again.');
  if(!Array.isArray(selectedCellIds)||selectedCellIds.length>120||new Set(selectedCellIds).size!==selectedCellIds.length)throw Error('Select unique bounded H3 cells.');
  const chosen=selectedCellIds.length?eligible.filter(c=>selectedCellIds.includes(c.id)):eligible;
  const ordered=hexRoute(chosen,boundary[0]);
  record.plan.geometry.features.find(f=>f.properties.kind==='path').geometry.coordinates=ordered.length===1?[target,ordered[0].center]:ordered.map(c=>c.center);
  record.plan.routeCells=ordered.map(c=>({id:c.id,alias:c.alias,center:c.center}));
  record.plan.cellIndex={scheme:'H3',algorithmVersion:2,resolution:index.resolution,cellIds:chosen.map(c=>c.id),edgePolicy:'fully-contained',coverageBasis:'displayed-whole-cells'};
  record.plan.runtimeCellIds=chosen.map(c=>c.id);
  record.plan.selectedRegion=region?{id:region.id,name:region.name,sourceURL:region.source_url||region.sourceURL}:null;
  record.plan.coverageGeometry={type:'MultiPolygon',coordinates:chosen.map(c=>c.geometry.coordinates)};
  record.plan.waypoints=ordered.map(c=>({cell_id:c.id,latitude_deg:c.center[1],longitude_deg:c.center[0],altitude_m:a,altitude_reference:'AGL_INTENT',sensor_requirement:scenario.payload}));
  return record;
}
