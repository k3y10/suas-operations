import test from 'node:test';
import assert from 'node:assert/strict';
import {createSurveyPlan,SCENARIOS} from '../src/mission-planning.js';
import {readDrafts,writeDrafts,createDraft} from '../src/drafts.js';
const input={scenarioId:'snow-survey',target:[-111.64,40.66],altitude:60,width:200};
test('survey plans remain bounded planning geometry, without execution authority',()=>{
 for(const width of [100,200,1000]) for(const scenario of SCENARIOS){
 const d=createSurveyPlan({...input,width,scenarioId:scenario.id});
 assert.equal(d.executionAuthorized,false);assert.equal(d.plan.dispatched,false);assert.equal(d.plan.approval,null);assert.equal(d.plan.launchLocation,null);assert.equal(d.plan.altitudeIntent.terrainValidated,false);
 const [boundary,path]=d.plan.geometry.features; assert(path.geometry.coordinates.length<=64);
 const ring=boundary.geometry.coordinates[0];assert.deepEqual(ring[0],ring[4]);
 for(const [x,y] of path.geometry.coordinates){assert(x>=ring[0][0]&&x<=ring[1][0]);assert(y>=ring[0][1]&&y<=ring[2][1]);}
 }
});
test('reject invalid, polar, dateline and out-of-profile plans',()=>{
 for(const patch of [{target:null},{target:[NaN,40]},{target:[0,81]},{target:[179.999,40]},{target:[0,80]},{altitude:''},{altitude:121},{width:99},{width:Infinity},{scenarioId:'unknown'}]) assert.throws(()=>createSurveyPlan({...input,...patch}));
});
test('each proposal has a fresh identity, retains optional metadata and legacy drafts',()=>{
 const a=createSurveyPlan(input),b=createSurveyPlan({...input,altitude:70});assert.notEqual(a.id,b.id);
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
 const legacy=createDraft('Existing mission','Mountain',null);writeDrafts(storage,[a,legacy]);assert.equal(readDrafts(storage).length,2);assert.deepEqual(readDrafts(storage)[0].plan,a.plan);
 const o=createSurveyPlan({...input,observation:{filename:'pit.pdf',observedAtLocal:'2026-10-24T10:00',timeZone:'America/Denver'}});assert.equal(o.plan.observation.uploadStatus,'not_uploaded');
});
