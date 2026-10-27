import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeMissionManifest} from '../src/flight-data.js';
const id='00000000-0000-0000-0000-000000000001';
test('live cell route belongs to the observed mission and exact revision',()=>{
 const p={schema:'terrasatch.simulation-mission.v1',environment:'simulation',id,request_id:id,revision:2,content_hash:'a'.repeat(64),waypoints:[{latitude_deg:40.66,longitude_deg:-111.64,relative_altitude_m:30}]};
 const packet={mission_manifest:p,mission:{id,plan_id:id,revision:2,content_hash:p.content_hash}};
 assert.equal(decodeMissionManifest(packet).waypoints[0].latitude_deg,40.66);
 assert.throws(()=>decodeMissionManifest({...packet,mission:{...packet.mission,revision:1}}));
 assert.throws(()=>decodeMissionManifest({...packet,mission_manifest:{...p,request_id:'unrelated'}}));
});
