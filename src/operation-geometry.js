import {insideGeometry} from './terrain-context.js';
export function geometryBounds(g){const pairs=g?.type==='Polygon'?g.coordinates.flat(1):g?.type==='MultiPolygon'?g.coordinates.flat(2):[];if(!pairs.length)return null;let w=180,s=90,e=-180,n=-90;for(const p of pairs){w=Math.min(w,p[0]);e=Math.max(e,p[0]);s=Math.min(s,p[1]);n=Math.max(n,p[1]);}return [[w,s],[e,n]];}
export function geometryPoint(g){
 const bounds=geometryBounds(g);if(!bounds)return null;
 const [[w,s],[e,n]]=bounds,mid=[(w+e)/2,(s+n)/2];if(insideGeometry(mid,g))return mid;
 // Find a contained sample for concave/multipart regions; never use an outside bbox centre.
 for(let d=1;d<=20;d++)for(let y=0;y<d;y++)for(let x=0;x<d;x++){const p=[w+(x+.5)*(e-w)/d,s+(y+.5)*(n-s)/d];if(insideGeometry(p,g))return p;}
 return null;
}
export function cellInGeometry(cell,g){
 if(!g)return true;const ring=cell.geometry.coordinates[0];if(!ring.every(p=>insideGeometry(p,g)))return false;
 const orient=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 const crosses=(a,b,c,d)=>orient(a,b,c)*orient(a,b,d)<0&&orient(c,d,a)*orient(c,d,b)<0;
 const polygons=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
 for(const polygon of polygons)for(const boundary of polygon){
  if(boundary.some(p=>insideGeometry(p,cell.geometry)))return false;
  for(let i=1;i<ring.length;i++)for(let j=1;j<boundary.length;j++)if(crosses(ring[i-1],ring[i],boundary[j-1],boundary[j]))return false;
 }
 return true;
}
export function windVector(fromDegrees){const a=(fromDegrees+180)*Math.PI/180;return {east:Math.sin(a),north:Math.cos(a)};}
export function severityColor(value){const v=String(value||'').toLowerCase();return v.includes('high')?'#dd4343':v.includes('moderate')?'#ef9f45':v.includes('low')?'#e2ce79':v.includes('unburn')?'#71ae98':'#9ca3af';}
export function overlayFeatures(data,layers){
 const groups=[...(layers.history?(data?.history||[]):[]),...(layers.burns?(data?.burns||[]):[]),...(layers.severity?(data?.severity||[]):[])];
 return {type:'FeatureCollection',features:groups.map(r=>({type:'Feature',geometry:r.geometry,properties:{id:r.id,name:r.name,kind:r.kind,color:r.kind==='severity'?severityColor(r.severity):r.kind==='burn'?'#bd83ca':'#bea27f'}}))};
}
