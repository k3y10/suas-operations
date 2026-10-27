import {readJSON,publicHandler} from '../lib/public-source.js';
// Reachability is not proof verification. No records or user identifiers leave SUAS here.
export default publicHandler(async()=>{try{const d=await readJSON('https://api.quak.terrasatch.com/health/ready');return {service:'QuakSatch',reachable:d.status==='ready',proofRegistration:'not_configured',checkedAt:new Date().toISOString()};}catch{return {service:'QuakSatch',reachable:false,proofRegistration:'not_configured',checkedAt:new Date().toISOString()};}},{ttl:60000});
