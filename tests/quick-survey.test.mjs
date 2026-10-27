import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createSurveyPlan,previewSurveyPlan} from '../src/mission-planning.js';
import {buildMissionCells} from '../src/cell-coverage.js';
globalThis.crypto??=webcrypto;
const options={scenarioId:'snow-survey',target:[-111.6384,40.5884],altitude:30,width:100};

test('one-cell preview retains selectable neighbours but routes only the chosen real H3 centre',()=>{
 const grid=createSurveyPlan(options),id='8c2696add0037ff';
 assert(grid.plan.cellIndex.cellIds.includes(id));
 const preview=previewSurveyPlan({...options,selectedCellIds:[id]});
 const chosen=grid.plan.routeCells.find(c=>c.id===id);
 assert.deepEqual(preview.plan.geometry.features.find(f=>f.properties.kind==='path').geometry.coordinates,[options.target,chosen.center]);
 assert.equal(preview.plan.cellIndex.cellIds.length,grid.plan.cellIndex.cellIds.length);
 const final=createSurveyPlan({...options,selectedCellIds:[id]});
 assert.deepEqual(final.plan.cellIndex.cellIds,[id]);
 assert.equal(final.plan.waypoints.length,1);
 const cell=buildMissionCells(final.plan).cells[0];
 assert(cell.areaM2>100&&cell.areaM2<500);
 assert.equal(cell.geometry.coordinates[0].length,7);
 assert.equal(final.plan.approval,null);
 assert.equal(final.plan.dispatched,false);
});

test('two-cell quick geometry uses exactly those geographic cells without rescaling them',()=>{
 const grid=createSurveyPlan(options),ids=grid.plan.cellIndex.cellIds.slice(0,2);
 const final=createSurveyPlan({...options,selectedCellIds:ids});
 assert.deepEqual(final.plan.runtimeCellIds,ids);
 assert.equal(final.plan.coverageGeometry.coordinates.length,2);
 const full=buildMissionCells(grid.plan).cells,selected=buildMissionCells(final.plan).cells;
 for(const cell of selected)assert.deepEqual(cell.geometry,full.find(c=>c.id===cell.id).geometry);
 assert.throws(()=>previewSurveyPlan({...options,selectedCellIds:['8c26946a93601ff']}));
});
