import React,{useEffect,useState} from 'react';
import {computeCanonicalObjectProof} from '../vendor/quaksatch-object.mjs';
export function proofPayload(record){
 const canonical=value=>typeof value==='number'&&!Number.isSafeInteger(value)?String(value):Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).map(([k,v])=>[k,canonical(v)])):value;
 return canonical({objective:record.objective,plan:record.plan,target:record.target});
}
let statusRequest;
export default function IntegrityStatus({record}){
 const [digest,setDigest]=useState(''),[service,setService]=useState(null);
 useEffect(()=>{let active=true;setDigest('');computeCanonicalObjectProof({objectType:'terrasatch.suas-planning-record',objectId:record.id,payload:proofPayload(record)}).then(p=>{if(active)setDigest(p.commitment);}).catch(()=>{if(active)setDigest('unavailable');});return()=>{active=false;};},[record]);
 useEffect(()=>{let active=true;if(!statusRequest)statusRequest=fetch('/api/integrity',{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null);statusRequest.then(v=>{if(active)setService(v);});return()=>{active=false;};},[]);
 return <small className="integrity-status" title={digest&&digest!=='unavailable'?'Local QuakSatch v1 object commitment: '+digest:undefined}>Integrity: {digest&&digest!=='unavailable'?'record hashed':'hash pending'} → proof unregistered · {service?.reachable?'QuakSatch reachable':'QuakSatch not verified'}</small>;
}
