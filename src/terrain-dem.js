import {terrainFromSamples} from './terrain-context.js';
const Z=12,N=2**Z,SIZE=N*256,cache=new Map();
function pixel([lng,lat]){return [(lng+180)/360*SIZE,(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*SIZE];}
async function tile(x,y,signal){
 const key=x+','+y;if(cache.has(key))return cache.get(key);if(cache.size>=16)cache.delete(cache.keys().next().value);
 const promise=(async()=>{const r=await fetch('https://elevation-tiles-prod.s3.amazonaws.com/terrarium/'+Z+'/'+x+'/'+y+'.png',{signal});if(!r.ok)throw Error('Elevation tile unavailable.');const b=await r.blob();if(b.size>1024*1024)throw Error('Elevation tile exceeds budget.');const bitmap=await createImageBitmap(b);try{const canvas=new OffscreenCanvas(256,256),ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0);return ctx.getImageData(0,0,256,256).data;}finally{bitmap.close();}})();
 cache.set(key,promise);try{return await promise;}catch(e){cache.delete(key);throw e;}
}
export async function loadCellTerrain(cells,signal){
 if(cells.length>120)throw Error('Terrain cell budget exceeded.');const needed=new Set();
 for(const c of cells){const [px,py]=pixel(c.center).map(Math.floor);for(const [dx,dy] of [[0,0],[-1,0],[1,0],[0,-1],[0,1]])needed.add(Math.floor((px+dx)/256)+','+Math.floor((py+dy)/256));}
 if(needed.size>12)throw Error('Narrow this region to load terrain.');const tiles=new Map();for(const key of needed){if(signal?.aborted)throw new DOMException('Aborted','AbortError');const [x,y]=key.split(',').map(Number);tiles.set(key,await tile(x,y,signal));}
 const value=(x,y)=>{const tx=Math.floor(x/256),ty=Math.floor(y/256),bytes=tiles.get(tx+','+ty),i=((y%256)*256+x%256)*4,z=bytes[i]*256+bytes[i+1]+bytes[i+2]/256-32768;return z< -1000||z>9000?NaN:z;};
 return Object.fromEntries(cells.map(c=>{const [x,y]=pixel(c.center).map(Math.floor),v=terrainFromSamples({center:value(x,y),west:value(x-1,y),east:value(x+1,y),north:value(x,y-1),south:value(x,y+1),spacingM:2*Math.PI*6378137*Math.cos(c.center[1]*Math.PI/180)/SIZE});return [c.id,v?{...v,source:'Terrarium DEM',sourceURL:'https://registry.opendata.aws/terrain-tiles/',retrievedAt:new Date().toISOString(),method:'Central difference at DEM pixel spacing; coarse terrain estimate'}:null];}));
}
