// Reuses pyrots WFIGS current/history sources. Historical perimeters are not burn severity.
import {readJSON,iso,safeGeometry,publicHandler,pointParams} from '../lib/public-source.js';
import {FIRE_SOURCE,loadFire} from './fire-context.js';
export const INCIDENTS='https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Incident_Locations_Current/FeatureServer/0';
export const HISTORY='https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/InterAgencyFirePerimeterHistory_All_Years_View/FeatureServer/0';
export const MTBS='https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MTBS_01/MapServer/63';
export const SEVERITY='https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_BurnedAreaEmergencyResponse_01/MapServer/1';
export function normalizeIncidents(d){return (d.features||[]).slice(0,60).flatMap(f=>{const p=f.attributes||f.properties||{},lat=p.InitialLatitude,lon=p.InitialLongitude;if(!Number.isFinite(lat)||!Number.isFinite(lon))return [];return [{id:String(p.IrwinID),name:String(p.IncidentName||'Wildfire').slice(0,120),point:[lon,lat],acres:Number.isFinite(p.IncidentSize)?p.IncidentSize:null,contained:Number.isFinite(p.PercentContained)?p.PercentContained:null,updatedAt:iso(p.ModifiedOnDateTime_dt),outAt:iso(p.FireOutDateTime),reportedActive:p.ActiveFireCandidate===1,sourceURL:INCIDENTS}];});}
export async function loadIncidents(fetcher=fetch){
 const q=new URLSearchParams({f:'json',where:"POOState='US-UT' AND IncidentTypeCategory='WF'",outFields:'IrwinID,IncidentName,InitialLatitude,InitialLongitude,IncidentSize,PercentContained,ModifiedOnDateTime_dt,FireOutDateTime,ActiveFireCandidate',returnGeometry:'false',orderByFields:'ModifiedOnDateTime_dt DESC',resultRecordCount:'60'});
 return {incidents:normalizeIncidents(await readJSON(INCIDENTS+'/query?'+q,fetcher)),retrievedAt:new Date().toISOString(),sourceURL:INCIDENTS};
}
async function polygons(source,lat,lon,fields,where,fetcher){
 const d=.16,q=new URLSearchParams({f:'geojson',where,outFields:fields,returnGeometry:'true',outSR:'4326',inSR:'4326',geometryType:'esriGeometryEnvelope',spatialRel:'esriSpatialRelIntersects',geometry:[lon-d,lat-d,lon+d,lat+d].join(','),geometryPrecision:'5',maxAllowableOffset:'0.0001',resultRecordCount:'20'});
 const data=await readJSON(source+'/query?'+q,fetcher);
 let vertices=0;
 return {truncated:data.exceededTransferLimit===true||data.properties?.exceededTransferLimit===true,features:(data.features||[]).filter(f=>{if(!safeGeometry(f.geometry))return false;vertices+=JSON.stringify(f.geometry).length;return vertices<1800000;}).slice(0,20)};
}
export async function loadPyro(lat,lon,fetcher=fetch){
 const results=await Promise.allSettled([loadFire(lat,lon,fetcher),polygons(HISTORY,lat,lon,'OBJECTID,INCIDENT,FIRE_YEAR,DATE_CUR,IRWINID',"1=1",fetcher),polygons(MTBS,lat,lon,'objectid,fire_id,fire_name,year,ig_date,map_id',"1=1",fetcher),polygons(SEVERITY,lat,lon,'objectid,baer_name,soil_burn_severity,last_edited_date,report_id',"1=1",fetcher)]);
 const value=i=>results[i].status==='fulfilled'?results[i].value:null;
 const history=(value(1)?.features||[]).map(f=>({id:'history:'+f.properties.OBJECTID,name:String(f.properties.INCIDENT||'Historical fire'),year:f.properties.FIRE_YEAR,geometry:f.geometry,source_url:HISTORY,kind:'history',source_updated_at:iso(f.properties.DATE_CUR)}));
 const burns=(value(2)?.features||[]).map(f=>({id:'mtbs:'+f.properties.objectid,name:String(f.properties.fire_name||'Mapped burn'),year:f.properties.year,geometry:f.geometry,source_url:MTBS,kind:'burn',source_updated_at:iso(f.properties.ig_date)}));
 const severity=(value(3)?.features||[]).map(f=>({id:'baer:'+f.properties.objectid,name:String(f.properties.baer_name||'BAER assessment'),severity:String(f.properties.soil_burn_severity||'Unclassified'),geometry:f.geometry,source_url:SEVERITY,kind:'severity',source_updated_at:iso(f.properties.last_edited_date)}));
 return {regions:value(0)?.regions||[],history,burns,severity,retrievedAt:new Date().toISOString(),truncated:results.some(r=>r.status==='fulfilled'&&r.value.truncated),warnings:results.flatMap((r,i)=>r.status==='rejected'?[['Current perimeter unavailable','Historical perimeters unavailable','MTBS mapped burns unavailable','BAER severity unavailable'][i]]:[])};
}
export default publicHandler(params=>{if(params.get('kind')==='incidents')return loadIncidents();const {lat,lon}=pointParams(params);return loadPyro(Number(lat.toFixed(4)),Number(lon.toFixed(4)));});
