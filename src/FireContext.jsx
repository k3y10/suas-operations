import React,{useEffect,useState} from 'react';
export default function FireContext({target,offline,onRegions,onSelect}){
 const [data,setData]=useState(null),[error,setError]=useState('');
 const lat=target?.[1],lon=target?.[0];
 useEffect(()=>{setData(null);onRegions(null);setError('');if(!target||offline)return;let active=true,controller;
  async function load(){if(document.hidden)return;controller=new AbortController();try{
   const r=await fetch('/api/fire-context?lat='+lat+'&lon='+lon,{cache:'no-store',signal:controller.signal}),d=await r.json();
   if(!r.ok)throw Error(d.detail||'Perimeter unavailable.');if(active){setData(d);onRegions(d.regions);setError('');}
  }catch(e){if(active&&e.name!=='AbortError')setError(e.message);}}
  load();const timer=setInterval(load,300000);return()=>{active=false;controller?.abort();clearInterval(timer);};
 },[lat,lon,offline,onRegions]);
 return <details className='mission-detail' open><summary>Wildfire boundary reports</summary><p className='hint'>Published WFIGS polygons near this area. Boundary and containment reports have separate dates. Select a boundary point for a local reconnaissance draft.</p>{error&&<p role='status' className='feedback'>{error}</p>}{!target&&<p>Select the affected area on the map.</p>}{data&&<>{!data.regions.length&&<p>No published fire perimeter returned near this area.</p>}{data.regions.map(r=><article className='asset-record' key={r.id}><strong>{r.name}</strong><p>Boundary: {r.source_updated_at?new Date(r.source_updated_at).toLocaleString():'date unavailable'}</p><p>Reported containment: {r.containment_percent===null?'unavailable':r.containment_percent+'%'} · {r.containment_updated_at?new Date(r.containment_updated_at).toLocaleString():'date unavailable'}</p><button className='outline' onClick={()=>{const ring=r.geometry.type==='Polygon'?r.geometry.coordinates[0]:r.geometry.coordinates[0][0];const point=[...ring].sort((a,b)=>(a[0]-lon)**2+(a[1]-lat)**2-((b[0]-lon)**2+(b[1]-lat)**2))[0];onSelect(point);}}>Focus nearest reported boundary</button><a className='source-link' href={r.source_url} target='_blank' rel='noreferrer'>WFIGS source ↗</a></article>)}{data.truncated&&<p className='notice'>Source results are limited; narrow the area for more detail.</p>}<small>Retrieved {new Date(data.retrievedAt).toLocaleString()}</small></>}</details>;
}
