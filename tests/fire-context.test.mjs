import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeFire,loadFire,FIRE_SOURCE} from '../api/fire-context.js';
const feature={type:'Feature',geometry:{type:'Polygon',coordinates:[[[-111.64,40.66],[-111.63,40.66],[-111.63,40.67],[-111.64,40.66]]]},properties:{OBJECTID:1,poly_IRWINID:'synthetic-id',poly_IncidentName:'Test fixture',poly_DateCurrent:Date.parse('2026-10-25T00:00:00Z'),attr_PercentContained:35,attr_ModifiedOnDateTime_dt:Date.parse('2026-10-24T20:00:00Z')}};
test('perimeter polygons preserve separate containment and boundary dates',()=>{
 const [r]=normalizeFire({features:[feature]});assert.equal(r.containment_percent,35);assert.equal(r.geometry.type,'Polygon');assert.notEqual(r.containment_updated_at,r.source_updated_at);
 assert.equal(normalizeFire({features:[{...feature,geometry:{type:'Point',coordinates:[-111,40]}}]}).length,0);
 const [unknown]=normalizeFire({features:[{...feature,properties:{...feature.properties,attr_PercentContained:null}}]});assert.equal(unknown.containment_percent,null);
 assert.throws(()=>normalizeFire({error:{message:'source failed'}}));
});
test('fire query is spatially bounded and uses a fixed published source',async()=>{
 let url;const result=await loadFire(40.66,-111.64,async u=>{url=new URL(u);return new Response(JSON.stringify({features:[feature]}));});
 assert.equal(url.origin,new URL(FIRE_SOURCE).origin);assert.equal(url.searchParams.get('resultRecordCount'),'8');assert.equal(url.searchParams.get('geometryType'),'esriGeometryEnvelope');assert.equal(result.regions.length,1);
});
