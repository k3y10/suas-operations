import test from 'node:test';
import assert from 'node:assert/strict';
import {droneSymbolPixels,cellLabelDetail,cellScreenSpan} from '../src/map-scale.js';
import {mapStyle,MAX_MAP_ZOOM,NAIP_DETAIL} from '../src/basemaps.js';
test('zoomed-out cells suppress overlapping labels; close cells reveal coverage',()=>{
 assert.equal(cellLabelDetail(12),'hidden');assert.equal(cellLabelDetail(12,true),'alias');
 assert.equal(cellLabelDetail(50),'alias');assert.equal(cellLabelDetail(90),'coverage');
 assert.equal(cellScreenSpan([{x:0,y:0},{x:60,y:20}]),20);
 assert.equal(cellScreenSpan([]),0);
});
test('location symbols preserve square proportions and stay bounded across zoom',()=>{
 assert.equal(droneSymbolPixels(0),16);assert.equal(droneSymbolPixels(22),28);
 assert(droneSymbolPixels(17)>droneSymbolPixels(13));
});
test('detail imagery requests preserve Web Mercator coordinates and RGB bands',()=>{
 const style=mapStyle('imagery');assert.equal(MAX_MAP_ZOOM,17.5);
 assert.equal(style.sources['naip-detail'],NAIP_DETAIL);
 assert(NAIP_DETAIL.tiles[0].includes('bbox={bbox-epsg-3857}'));
 assert(NAIP_DETAIL.tiles[0].includes('bboxSR=3857&imageSR=3857'));
 assert(NAIP_DETAIL.tiles[0].includes('bandIds=0,1,2'));
 assert.equal(NAIP_DETAIL.tileSize,512);assert(NAIP_DETAIL.maxzoom>=MAX_MAP_ZOOM);
 assert(style.layers.find(l=>l.id==='naip-detail').minzoom>=13);
 assert(!JSON.stringify(style).toLowerCase().includes('topo'));
});
