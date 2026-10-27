import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeZones,providerTime} from '../api/avalanche.js';
import {normalizeIncidents} from '../api/pyro.js';
import {loadRain} from '../api/rainfall.js';
import {createSurveyPlan} from '../src/mission-planning.js';
import {insideGeometry} from '../src/terrain-context.js';
import {geometryPoint,windVector,severityColor} from '../src/operation-geometry.js';
const geometry={type:'Polygon',coordinates:[[[-112,40],[-111,40],[-111,41],[-112,41],[-112,40]]]};
const zones={features:[{properties:{name:'Salt Lake',forecast_key:'salt-lake'},geometry}]};
const now=Date.parse('2026-01-10T18:00:00Z');
const product=p=>({features:[{properties:{center_id:'UAC',link:'https://utahavalanchecenter.org/forecast/salt-lake',danger_level:3,start_date:'2026-01-10T06:00:00',end_date:'2026-01-11T06:00:00',timezone:'America/Denver',...p}}]});
test('official UAC levels need a matching region and current issuer interval',()=>{
 const r=normalizeZones(zones,product({}),now)[0];assert.equal(r.avalanche_rating.level,3);assert.equal(r.geometry,geometry);assert.equal(r.avalanche_rating.valid_until,'2026-01-11T13:00:00.000Z');
 for(const patch of [{end_date:null},{end_date:'2026-01-09T06:00:00'},{start_date:'2026-01-12T06:00:00'},{danger_level:-1},{off_season:true},{danger_level:6}])assert.equal(normalizeZones(zones,product(patch),now)[0].avalanche_rating.level,null);
});
test('provider-local times retain daylight-saving offsets and reject ambiguous formats',()=>{
 assert.equal(providerTime('2026-07-10T06:00:00'),'2026-07-10T12:00:00.000Z');assert.equal(providerTime('2026-01-10T06:00:00'),'2026-01-10T13:00:00.000Z');assert.equal(providerTime('bad'),null);
});
test('region representative points respect holes and concave geometry',()=>{
 const g={...geometry,coordinates:[geometry.coordinates[0],[[-111.6,40.4],[-111.4,40.4],[-111.4,40.6],[-111.6,40.6],[-111.6,40.4]]]};assert(insideGeometry(geometryPoint(g),g));
});
test('exact selected H3 cells determine ordered waypoints and coverage geometry',()=>{
 const args={scenarioId:'crew-recon',target:[-109.9232,39.3697],altitude:60,width:200};const all=createSurveyPlan(args),ids=all.plan.cellIndex.cellIds.slice(0,2),d=createSurveyPlan({...args,selectedCellIds:ids});
 assert.equal(d.plan.waypoints.length,2);assert.deepEqual(new Set(d.plan.waypoints.map(w=>w.cell_id)),new Set(ids));assert.equal(d.plan.coverageGeometry.coordinates.length,2);assert.equal(d.executionAuthorized,false);assert(d.plan.waypoints.every(w=>w.altitude_reference==='AGL_INTENT'));
 assert.throws(()=>createSurveyPlan({...args,selectedCellIds:['8b000000000ffff']}));
});
test('geometry constraints never silently replace an outside selection with a square',()=>{
 assert.throws(()=>createSurveyPlan({scenarioId:'snow-survey',target:[-109,39],altitude:60,width:200,region:{id:'test',geometry}}),/No complete/);
});
test('incident status and coordinates remain dated provider fields, never hardcoded case-study facts',()=>{
 const records=normalizeIncidents({features:[{attributes:{IrwinID:'a',IncidentName:'Slough Canyon',InitialLatitude:39,InitialLongitude:-110,PercentContained:95,ModifiedOnDateTime_dt:now,ActiveFireCandidate:1}}]});assert.equal(records[0].reportedActive,true);assert.equal(records[0].updatedAt,new Date(now).toISOString());assert.equal(records[0].outAt,null);assert.equal(records[0].contained,95);
});
test('meteorological wind FROM north travels south; east travels west',()=>{
 const n=windVector(0),e=windVector(90);assert(Math.abs(n.east)<1e-10&&n.north<0);assert(e.east<0&&Math.abs(e.north)<1e-10);assert.notEqual(severityColor('High'),severityColor('Unburned'));
});
test('rain samples preserve zero, reject NoData and bind the exact catalog raster/time',async()=>{
 const end=Date.now()-60000;let count=0;const fetcher=async u=>{count++;return new Response(JSON.stringify(count===1?{features:[{attributes:{objectid:7,idp_validendtime:end}}]}:{samples:[{value:'0',location:{x:-110,y:39}},{value:'NoData',location:{x:-110,y:39}},{value:'1',location:{x:-110,y:39}}]}));};
 const d=await loadRain(39,-110,fetcher);assert.equal(d.samples.length,2);assert.equal(d.samples[0].millimetres,0);assert.equal(d.samples[1].millimetres,25.4);assert(d.tileURL.includes('lockRasterIds'));assert.equal(Date.parse(d.endAt)-Date.parse(d.startAt),86400000);
});
