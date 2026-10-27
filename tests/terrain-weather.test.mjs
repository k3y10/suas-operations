import test from 'node:test';import assert from 'node:assert/strict';
import {terrainFromSamples,insideGeometry,issuedRating,fireReconPriority,slopeColor} from '../src/terrain-context.js';
import {observedWind} from '../src/weather-data.js';
import {nwsURL,loadWeather} from '../api/environment.js';
import {createSurveyPlan} from '../src/mission-planning.js';
test('slope and downslope aspect follow physical derivatives, with a flat undefined aspect',()=>{
 const t=terrainFromSamples({west:90,east:110,north:100,south:100,center:100,spacingM:10});assert.equal(t.slopeDegrees,45);assert.equal(t.aspectDegrees,270);
 assert.equal(terrainFromSamples({west:100,east:100,north:100,south:100,center:100,spacingM:10}).aspectDegrees,null);
 assert.equal(terrainFromSamples({west:NaN,east:100,north:100,south:100,center:100,spacingM:10}),null);assert.notEqual(slopeColor(20),slopeColor(40));
});
const now=Date.now(),ring=[[-111.65,40.65],[-111.63,40.65],[-111.63,40.67],[-111.65,40.67],[-111.65,40.65]],geometry={type:'Polygon',coordinates:[ring]};
test('issued ratings need geometry intersection and a current validity interval',()=>{
 const cell={center:[-111.64,40.66]},r={geometry,avalanche_rating:{level:3,status:'current',valid_from:new Date(now-1000).toISOString(),valid_until:new Date(now+1000).toISOString()}};
 assert(insideGeometry(cell.center,geometry));assert(issuedRating(cell,[r],now));assert.equal(issuedRating(cell,[r],now+2000),null);assert.equal(issuedRating({center:[0,0]},[r],now),null);
});
test('wind conversion rejects old observations and fire priority never infers containment',()=>{
 const w={observation:{observedAt:new Date(now).toISOString(),windSpeed:{value:18,unit:'wmoUnit:km_h-1'},windDirection:{value:0}}},wind=observedWind(w,now);assert.equal(wind.speedMps,5);assert.equal(observedWind(w,now+3600001),null);
 const r={id:'perimeter-source',geometry,source_updated_at:new Date(now).toISOString()},cell={center:[-111.64,40.6499]};
 assert.equal(fireReconPriority(cell,[r],wind,now)?.level,'priority_1');assert.equal(fireReconPriority(cell,[r],null,now),null);assert.equal(fireReconPriority(cell,[r],wind,now+86400001),null);
});
test('hex route contains exactly the indexed cell centers in a different supplied geography',()=>{
 const a=createSurveyPlan({scenarioId:'snow-survey',target:[-111.64,40.66],altitude:60,width:200}),b=createSurveyPlan({scenarioId:'snow-survey',target:[-111.65,40.67],altitude:60,width:200});
 assert.equal(new Set(a.plan.routeCells.map(c=>c.id)).size,a.plan.cellIndex.cellIds.length);
 assert.deepEqual(a.plan.geometry.features[1].geometry.coordinates,a.plan.routeCells.map(c=>c.center));assert.notDeepEqual(a.plan.routeCells,b.plan.routeCells);
});
test('NWS discovery cannot redirect data requests to another origin',()=>{
 for(const url of ['https://other.invalid/x','//other.invalid/a','http://api.weather.gov/a'])assert.throws(()=>nwsURL(url));assert.equal(nwsURL('/points/40,-111'),'https://api.weather.gov/points/40,-111');
});
test('weather keeps dated station data, forecasts and alert reports separate',async()=>{
 const pages={
 '/points/40,-111':{properties:{observationStations:'https://api.weather.gov/stations',forecastHourly:'https://api.weather.gov/hourly',relativeLocation:{properties:{state:'UT'}}}},
 '/stations':{features:[{id:'https://api.weather.gov/stations/TEST'}]},
 '/stations/TEST/observations/latest':{properties:{timestamp:'2026-10-25T12:00:00Z',textDescription:'Clear',windSpeed:{value:18,unitCode:'wmoUnit:km_h-1'}}},
 '/hourly':{properties:{updated:'2026-10-25T12:00:00Z',periods:[{startTime:'2026-10-25T13:00:00Z',temperature:8,temperatureUnit:'C'}]}},
 '/alerts/active?point=40,-111':{features:[]}
 };
 const data=await loadWeather(40,-111,async url=>new Response(JSON.stringify(pages[new URL(url).pathname+new URL(url).search]),{headers:{'Content-Type':'application/json'}}));assert.equal(data.state,'UT');assert.equal(data.observation.observedAt,'2026-10-25T12:00:00Z');assert.equal(data.forecast.length,1);assert.deepEqual(data.warnings,[]);
});
