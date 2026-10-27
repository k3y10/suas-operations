import {readJSON,publicHandler} from '../lib/public-source.js';
// Reachability is not proof verification. No records or user identifiers leave SUAS here.
export default publicHandler(async()=>{try{const d=await readJSON('https://api.quak.terrasatch.com/health/ready');return {service:'QuakSatch',reachable:d.status==='ready',proofRegistration:'requires_authenticated_mission',checkedAt:new Date().toISOString()};}catch{return {service:'QuakSatch',reachable:false,proofRegistration:'requires_authenticated_mission',checkedAt:new Date().toISOString()};}},{ttl:60000});
