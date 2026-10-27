import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {decodeNativePacket,decodeSamples,flightConnected,flightConnectionState,FEED_RESPONSE_TIMEOUT_MS,frameAt,observedTrack} from '../src/flight-data.js';
const recording=JSON.parse(await readFile(new URL('../src/evidence/native-flight.json',import.meta.url)));
const decoded=decodeNativePacket(recording);
test('bundled playback preserves the 26 genuine recorded samples and their provenance',()=>{
 assert.equal(recording.samples.length,26);assert.equal(decoded.mode,'recorded');assert.equal(flightConnected(decoded),false);assert.equal(decoded.result.airborne_observed,true);assert.equal(Math.max(...decoded.samples.map(s=>s.relative_altitude_m??-Infinity)),decoded.result.max_observed_relative_altitude_m);assert(decoded.samples.some(s=>s.in_air===true&&s.relative_altitude_m>=3));assert(decoded.samples.every(s=>s.battery_remaining_fraction===null));
});
test('sample interpolation stays between measured points and never bridges a dropout',()=>{
 const samples=decodeSamples([{sampled_at:'2026-01-01T00:00:00Z',latitude_deg:0,longitude_deg:0,relative_altitude_m:0},{sampled_at:'2026-01-01T00:00:01Z',latitude_deg:1,longitude_deg:1,relative_altitude_m:5}]);
 const frame=frameAt(samples,samples[0].time+500);assert.equal(frame.relative_altitude_m,2.5);assert.equal(frame.latitude_deg,.5);assert.equal(frameAt(samples,samples[1].time+5000).relative_altitude_m,5);assert.equal(frameAt(samples,samples[0].time-1),null);assert.equal(frameAt(samples,samples[0].time+500,{interpolate:false}).relative_altitude_m,0);
 samples[1].time+=4000;assert.equal(frameAt(samples,samples[0].time+500).relative_altitude_m,0);samples[1].time-=4000;samples[0].connected=false;assert.equal(frameAt(samples,samples[0].time+500).relative_altitude_m,0);
});
test('stale or recorded observations never report a live simulator connection',()=>{
 const last=decoded.samples.at(-1),data={...decoded,mode:'live',connected:true,stale:false};assert(flightConnected(data,last.time+1000));assert(!flightConnected(data,last.time+3001));assert(!flightConnected({...data,stale:true},last.time));assert(!flightConnected({...data,mode:'recorded'},last.time));
});
test('unknown values remain unknown while zero coordinates, altitude and battery stay zero',()=>{
 const [s]=decodeSamples([{sampled_at:'2026-01-01T00:00:00Z',latitude_deg:0,longitude_deg:0,relative_altitude_m:0,battery_remaining_fraction:0,ground_speed_m_s:null}]);assert.equal(s.longitude_deg,0);assert.equal(s.relative_altitude_m,0);assert.equal(s.battery_remaining_fraction,0);assert.equal(s.ground_speed_m_s,null);assert.equal(s.armed,null);
});
test('malformed identity, samples, ordering and future timestamps fail closed',()=>{
 assert.throws(()=>decodeNativePacket({...recording,source:'invented'}));assert.throws(()=>decodeNativePacket({...recording,px4_revision:'other'}));assert.throws(()=>decodeNativePacket({...recording,run_id:'../../private'}));assert.throws(()=>decodeSamples(Array(301).fill(recording.samples[0])));assert.throws(()=>decodeSamples([{sampled_at:'2026-01-01'}]));assert.throws(()=>decodeSamples([recording.samples[1],recording.samples[0]]));assert.throws(()=>decodeSamples([{sampled_at:'2099-01-01T00:00:00Z'}]));
});
test('observed track contains only received valid connected points at or before the displayed time',()=>{
 const points=decoded.samples.filter(s=>s.connected&&s.longitude_deg!==null);const track=observedTrack(decoded.samples,points[1].time);assert.equal(track.features[0].geometry.coordinates.length,2);assert.equal(observedTrack(decoded.samples,points[0].time).features.length,0);assert.deepEqual(track.features[0].geometry.coordinates[0],[points[0].longitude_deg,points[0].latitude_deg]);
});

test('track does not connect separate observed segments across a telemetry gap',()=>{const samples=decodeSamples(Array.from({length:5},(_,i)=>({sampled_at:new Date(Date.parse('2026-01-01T00:00:00Z')+i*1000).toISOString(),longitude_deg:i,latitude_deg:i,connected:i!==2})));const track=observedTrack(samples);assert.equal(track.features.length,2);assert.deepEqual(track.features.map(f=>f.geometry.coordinates.length),[2,2]);});

test('measured gateway delays stay connected without calling stale observations live',()=>{
 const now=Date.parse('2026-10-26T06:30:50Z');
 for(const age of [894,2999,3001,3430,4958,7000]){
  const data={...decoded,mode:'live',connected:true,stale:false,receivedAt:now-100,samples:[{...decoded.samples.at(-1),time:now-age,connected:true}]};
  assert.equal(flightConnectionState(data,now),age<=3000?'live':'delayed');
  assert.equal(flightConnected(data,now),age<=3000);
 }
});
test('explicit PX4 disconnect is immediate and missing gateway responses time out',()=>{
 const now=Date.now(),data={...decoded,mode:'live',connected:true,stale:false,receivedAt:now,samples:[{...decoded.samples.at(-1),time:now,connected:true}]};
 assert.equal(flightConnectionState({...data,connected:false},now),'disconnected');
 assert.equal(flightConnectionState({...data,stale:true},now),'delayed');
 assert.equal(flightConnectionState(data,now+4000),'delayed');
 assert.equal(flightConnectionState(data,now+FEED_RESPONSE_TIMEOUT_MS+1),'disconnected');
 assert.equal(flightConnectionState({...data,receivedAt:undefined},now),'disconnected');
 assert.equal(flightConnectionState({...data,receivedAt:now+1},now),'disconnected');
 assert.equal(flightConnectionState({...data,samples:[]},now),'delayed');
 assert.equal(flightConnectionState(null,now),'waiting');
 assert.equal(flightConnectionState({...data,mode:'recorded'},now),'recorded');
});
