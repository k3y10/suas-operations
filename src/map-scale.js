// Marker symbols stay legible; geographic cells and tracks retain their real map coordinates.
export function droneSymbolPixels(zoom){return Math.max(16,Math.min(28,16+(zoom-12)*2));}
export function cellLabelDetail(spanPixels,selected=false){
 if(!Number.isFinite(spanPixels)||spanPixels<38)return selected?'alias':'hidden';
 return spanPixels>=72?'coverage':'alias';
}
export function cellScreenSpan(points){
 if(!points.length)return 0;
 const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
 return Math.min(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys));
}
export const ROUTE_WIDTH=['interpolate',['linear'],['zoom'],10,1,16,1.8,19,2.4];
export const CELL_WIDTH=['interpolate',['linear'],['zoom'],10,.5,16,1,19,1.5];
