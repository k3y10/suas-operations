// Context calculations; none of these values establish slope stability or fire containment.
export function terrainFromSamples({west,east,north,south,center,spacingM}){
 if(![west,east,north,south,center,spacingM].every(Number.isFinite)||spacingM<=0) return null;
 const dx=(east-west)/(2*spacingM),dy=(north-south)/(2*spacingM),gradient=Math.hypot(dx,dy);
 return {elevationM:center,slopeDegrees:Math.atan(gradient)*180/Math.PI,aspectDegrees:gradient<.00001?null:(Math.atan2(-dx,-dy)*180/Math.PI+360)%360,spacingM};
}
function inRing(p,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
export function insideGeometry(point,g){const polygons=g?.type==='Polygon'?[g.coordinates]:g?.type==='MultiPolygon'?g.coordinates:[];return polygons.some(rings=>rings[0]&&inRing(point,rings[0])&&!rings.slice(1).some(r=>inRing(point,r)));}
export function issuedRating(cell,regions,now=Date.now()){
 return regions.filter(r=>insideGeometry(cell.center,r.geometry)&&r.avalanche_rating?.status==='current'&&Number.isInteger(r.avalanche_rating.level)&&r.avalanche_rating.level>=1&&r.avalanche_rating.level<=5&&Date.parse(r.avalanche_rating.valid_from)<=now&&now<Date.parse(r.avalanche_rating.valid_until)).sort((a,b)=>b.avalanche_rating.level-a.avalanche_rating.level)[0]||null;
}
export function slopeColor(degrees){if(!Number.isFinite(degrees))return '#94a3b8';const stops=[[0,[72,139,156]],[25,[90,177,160]],[30,[249,215,103]],[35,[247,161,64]],[40,[235,87,68]],[50,[146,74,145]]];let a=stops[0],b=stops.at(-1);for(let i=1;i<stops.length;i++)if(degrees<=stops[i][0]){a=stops[i-1];b=stops[i];break;}const t=Math.max(0,Math.min(1,(degrees-a[0])/(b[0]-a[0])));return 'rgb('+a[1].map((x,i)=>Math.round(x+(b[1][i]-x)*t)).join(',')+')';}
function segmentDistance(p,a,b,lat){const scale=Math.cos(lat*Math.PI/180),x=(p[0]-a[0])*111320*scale,y=(p[1]-a[1])*111320,dx=(b[0]-a[0])*111320*scale,dy=(b[1]-a[1])*111320,t=Math.max(0,Math.min(1,(x*dx+y*dy)/(dx*dx+dy*dy||1)));return Math.hypot(x-t*dx,y-t*dy);}
export function fireReconPriority(cell,regions,wind,now=Date.now()){
 if(!wind||now-Date.parse(wind.observedAt)>3600000||now<Date.parse(wind.observedAt)-5000)return null;
 let best=null;
 for(const r of regions){const stamp=Date.parse(r.source_updated_at);if(!Number.isFinite(stamp)||now-stamp>86400000||stamp>now+5000)continue;
 const rings=r.geometry?.type==='Polygon'?[r.geometry.coordinates[0]]:r.geometry?.type==='MultiPolygon'?r.geometry.coordinates.map(p=>p[0]):[];
 for(const ring of rings){if(!ring?.length)continue;let distance=Infinity,nearest;
 for(let i=1;i<ring.length;i++){const d=segmentDistance(cell.center,ring[i-1],ring[i],cell.center[1]);if(d<distance){distance=d;nearest=[(ring[i-1][0]+ring[i][0])/2,(ring[i-1][1]+ring[i][1])/2];}}
 if(distance>200)continue;
 const dx=(cell.center[0]-nearest[0])*Math.cos(cell.center[1]*Math.PI/180),dy=cell.center[1]-nearest[1],bearing=(Math.atan2(dx,dy)*180/Math.PI+360)%360,downwind=(wind.fromDegrees+180)%360,alignment=Math.cos((bearing-downwind)*Math.PI/180);
 const containmentFresh=Number.isFinite(Date.parse(r.containment_updated_at))&&now-Date.parse(r.containment_updated_at)<=86400000&&Date.parse(r.containment_updated_at)<=now+5000;
 const contained=containmentFresh&&r.containment_percent===100;
 const level=contained?'priority_3':wind.speedMps>=4&&alignment>.5?'priority_1':'priority_2';
 const value={level,label:contained?'Reported contained boundary review':level==='priority_1'?'Downwind boundary reconnaissance':'Boundary reconnaissance',color:contained?'#7999ad':level==='priority_1'?'#f56565':'#f5a623',containmentPercent:containmentFresh?r.containment_percent:null,perimeterSource:r.id,perimeterUpdatedAt:r.source_updated_at,windObservedAt:wind.observedAt,distanceToBoundaryM:Math.round(distance),basis:'Review aid: within 200 m of a dated perimeter; priority 1 adds wind ≥4 m/s and downwind alignment ±60°. Not predicted spread, containment, or tactical guidance.'};
 if(!best||level<best.level)best=value;
 }}
 return best;
}
