import test from 'node:test';
import assert from 'node:assert/strict';
import {isValidCell,getResolution} from 'h3-js';
import {buildMissionCells,applyCoverage,parseCoverageLog,coverageSummary,regionFeatures} from '../src/cell-coverage.js';
import {createSurveyPlan} from '../src/mission-planning.js';
const draft=createSurveyPlan({scenarioId:'snow-survey',target:[-111.64,40.66],altitude:60,width:200});
const index=buildMissionCells(draft.plan),scope={planId:draft.id,revision:1,cells:index.cells};
const now=Date.parse('2026-10-25T12:00:00Z');
const packet=(patch={})=>({schema:'terrasatch.cell-coverage.v1',planId:draft.id,revision:1,cellId:index.cells[0].id,sequence:1,observedAt:'2026-10-25T12:00:00Z',coveragePct:50,quality:'accepted',sourceId:'unit-test-processor',evidenceId:'unit-test-footprint',...patch});
test('real H3 identities are deterministic, bounded and fully inside the survey',()=>{
 for(const width of [100,200,1000]){const p=createSurveyPlan({scenarioId:'snow-survey',target:[-111.64,40.66],altitude:60,width});const grid=buildMissionCells(p.plan),ring=p.plan.geometry.features[0].geometry.coordinates[0];assert(grid.cells.length>0&&grid.cells.length<=120);assert.deepEqual(grid,buildMissionCells(p.plan));assert.deepEqual(grid.cells.map(c=>c.id),p.plan.cellIndex.cellIds);for(const cell of grid.cells){assert(isValidCell(cell.id));assert.equal(getResolution(cell.id),grid.resolution);assert.deepEqual(cell.geometry.coordinates[0][0],cell.geometry.coordinates[0].at(-1));for(const [x,y] of cell.geometry.coordinates[0]){assert(x>=ring[0][0]&&x<=ring[1][0]);assert(y>=ring[0][1]&&y<=ring[2][1]);}}}
});
test('scan updates transition queued to scanning to reported complete, without duplicate notifications',()=>{
 let a=applyCoverage({},[packet({coveragePct:0})],scope,now);assert.equal(a.records[index.cells[0].id].state,'queued');
 a=applyCoverage(a.records,[packet({coveragePct:50,sequence:2})],scope,now);assert.equal(a.records[index.cells[0].id].state,'scanning');
 a=applyCoverage(a.records,[packet({coveragePct:100,sequence:3})],scope,now);assert.equal(a.records[index.cells[0].id].state,'complete');assert.equal(a.changes.length,1);
 assert.equal(applyCoverage(a.records,[packet({coveragePct:20,sequence:2})],scope,now).changes.length,0);
 assert.equal(applyCoverage(a.records,[packet({coveragePct:100,sequence:3})],scope,now).changes.length,0);
});
test('wrong mission/revision/cell, invalid times and unsupported measurements cannot color a cell',()=>{
 for(const patch of [{planId:'other'},{revision:2},{cellId:'C11'},{observedAt:'2026-10-25T12:01:00Z'},{observedAt:'2026-10-25'},{coveragePct:null},{coveragePct:101},{coveragePct:'50'},{sourceId:''},{evidenceId:''},{quality:'unreviewed'}]){const a=applyCoverage({},[packet(patch)],scope,now);assert.equal(Object.keys(a.records).length,0);assert.equal(a.rejected,1);}
 const a=applyCoverage({},[packet({sequence:5})],scope,now);assert.equal(applyCoverage(a.records,[packet({sequence:6,observedAt:'2026-10-25T11:59:59Z'})],scope,now).rejected,1);
});
test('coverage remains unknown until all cell areas have evidence; review does not count complete',()=>{
 const cells=[{id:'a',areaM2:1},{id:'b',areaM2:3}];assert.equal(coverageSummary(cells,{a:{coveragePct:100,state:'complete'}}).coveragePct,null);
 assert.equal(coverageSummary(cells,{a:{coveragePct:100,state:'complete'},b:{coveragePct:0,state:'queued'}}).coveragePct,25);
 const a=applyCoverage({},[packet({coveragePct:100,quality:'review_required'})],scope,now);assert.equal(a.records[index.cells[0].id].state,'review');assert.equal(coverageSummary(index.cells,a.records).complete,0);
});
test('logs and updates are bounded and malformed input fails clearly',()=>{assert.throws(()=>parseCoverageLog('x'.repeat(512*1024+1)));assert.throws(()=>parseCoverageLog('{bad}'));assert.throws(()=>parseCoverageLog('{}\n'.repeat(2001)));assert.deepEqual(parseCoverageLog(''),[]);assert.equal(parseCoverageLog(JSON.stringify(packet())).length,1);assert.throws(()=>applyCoverage({},Array(2001).fill(packet()),scope,now));});
test('regional danger colors expire and Pyro does not invent cell heat or fire spread',()=>{
 const region={id:'zone',name:'Zone',geometry:draft.plan.geometry.features[0].geometry,avalanche_rating:{status:'current',level:4,valid_from:'2026-10-25T11:00:00Z',valid_until:'2026-10-25T13:00:00Z'}};
 assert.equal(regionFeatures([region],'Avy',now).features[0].properties.color,'#ED1C24');assert.equal(regionFeatures([region],'Avy',now+7200000).features[0].properties.color,'#9CA3AF');assert.equal(regionFeatures([region],'Pyro',now).features[0].properties.scope,'Published incident perimeter');
});

test('reported payload measurements preserve units and unknown values without generating a hazard rating',()=>{const a=applyCoverage({},[packet({measurements:{surface_temperature_c:0,snow_depth_m:null}})],scope,now);assert.equal(a.records[index.cells[0].id].measurements.surface_temperature_c,0);assert.equal(a.records[index.cells[0].id].measurements.snow_depth_m,null);assert.equal(a.records[index.cells[0].id].dangerLevel,undefined);for(const measurements of [{danger_level:5},{surface_temperature_c:Infinity},{image_count:'ten'}])assert.equal(applyCoverage({},[packet({measurements})],scope,now).rejected,1);const b=applyCoverage(a.records,[packet({sequence:2,measurements:{surface_temperature_c:2}})],scope,now);assert.equal(b.changes[0].state,'measurements_updated');});
