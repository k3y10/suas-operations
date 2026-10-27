import React, { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
maplibregl.setWorkerUrl(workerUrl);
import { BASEMAPS, BASEMAP_KEY, savedBasemap, mapStyle, MAX_MAP_ZOOM } from "./basemaps.js";
import {FlightHUD} from './FlightConsole.jsx';
import {observedTrack,positionValid} from './flight-data.js';
import {loadCellTerrain} from './terrain-dem.js';
import {issuedRating,fireReconPriority} from './terrain-context.js';
import {observedWind,mapWind} from './weather-data.js';
import ScanCoverage,{useCoverageFeed} from './ScanCoverage.jsx';
import {buildMissionCells,cellFeatures,regionFeatures} from './cell-coverage.js';
import WindLayer from './WindLayer.jsx';
import {geometryBounds,overlayFeatures} from './operation-geometry.js';
import {droneSymbolPixels,cellLabelDetail,cellScreenSpan,ROUTE_WIDTH,CELL_WIDTH} from './map-scale.js';
function SingleMap({ three, target, setTarget, regions, offline, basemap, plan, cells, coverage, cellMode, selectedCell, setSelectedCell, domain, clock, flight, mobile, cellContext, selectedRegion, onRegion, overlayData, rain, layers, selectedCells, onCells, selectable, weather, fieldObservation, focusMission }) {
  const element = useRef(null),
    map = useRef(null),
    marker = useRef(null),
    activeBasemap = useRef(basemap),
    labels=useRef([]),
    aircraft=useRef(null),
    surveyBounds=useRef(null),
    flightCamera=useRef(null),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false);
  surveyBounds.current=plan?.geometry?.features?.find(f=>f.properties.kind==='boundary')?.geometry;
  const interaction=useRef({});interaction.current={setTarget,setSelectedCell,onRegion,regions,selectable,selectedCells,onCells,regionId:selectedRegion?.id};
  const wind=mapWind(weather,clock);
  useEffect(() => {
    let m;
    setReady(false);
    try {
      m = new maplibregl.Map({
        container: element.current,
        style: mapStyle(basemap),
        center: [-111.64, 40.66],
        zoom: 11.2,
        maxZoom: MAX_MAP_ZOOM,
        attributionControl: { compact: true },
        maxTileCacheSize: 40,
        renderWorldCopies: false,
      });
      map.current = m;
      m.addControl(
        new maplibregl.NavigationControl({ visualizePitch: true }),
        "bottom-right",
      );
      m.addControl(
        new maplibregl.ScaleControl({ unit: "metric" }),
        "bottom-left",
      );
      m.on('click',e=>{
        const hit=m.getLayer('scan-cells-fill')?m.queryRenderedFeatures(e.point,{layers:['scan-cells-fill']})[0]:null;
        if(hit){const id=hit.properties.id;interaction.current.setSelectedCell(id);if(interaction.current.selectable)interaction.current.onCells(old=>old.includes(id)?old.filter(x=>x!==id):[...old,id]);return;}
        const regionHit=m.getLayer('context-fill')?m.queryRenderedFeatures(e.point,{layers:['context-fill']})[0]:null;
        if(regionHit&&interaction.current.selectable&&regionHit.properties.id!==interaction.current.regionId){const r=interaction.current.regions.find(r=>r.id===regionHit.properties.id);if(r)interaction.current.onRegion(r);return;}
        interaction.current.setTarget([Number(e.lngLat.lng.toFixed(5)),Number(e.lngLat.lat.toFixed(5))]);
      });
      m.on("load", () => {
        if(map.current!==m)return;
        m.addSource("context", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        m.addLayer({
          id: "context-fill",
          type: "fill",
          source: "context",
          paint: { "fill-color": "#efa124", "fill-opacity": 0.12 },
        });
        m.addLayer({
          id: "context-line",
          type: "line",
          source: "context",
          paint: { "line-color": "#efa124", "line-width": 1.5 },
        });
        m.addSource('selected-region',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
        m.addLayer({id:'selected-region-line',type:'line',source:'selected-region',paint:{'line-color':'#fafafa','line-width':2}});
        m.addSource('context-extra',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
        m.addLayer({id:'context-extra-fill',type:'fill',source:'context-extra',paint:{'fill-color':['get','color'],'fill-opacity':.2}});
        m.addLayer({id:'context-extra-line',type:'line',source:'context-extra',paint:{'line-color':['get','color'],'line-width':1.2}});
        m.addLayer({id:'context-selected',type:'line',source:'context',filter:['==',['get','id'],''],paint:{'line-color':'#f8fafc','line-width':2.5}});
        m.addSource('downhill',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
        m.addLayer({id:'downhill-lines',type:'line',source:'downhill',paint:{'line-color':'#60b8ff','line-width':2}});
        m.addSource('draft-plan', {type:'geojson',data:{type:'FeatureCollection',features:[]}});
        m.addLayer({id:'draft-boundary',type:'fill',source:'draft-plan',filter:['==',['get','kind'],'boundary'],paint:{'fill-color':'#efa124','fill-opacity':0.09}});
        m.addLayer({id:'draft-path',type:'line',source:'draft-plan',filter:['==',['get','kind'],'path'],paint:{'line-color':'#ffc15a','line-width':ROUTE_WIDTH,'line-dasharray':[2,2]}});
        m.addSource('scan-cells',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
        m.addLayer({id:'scan-cells-fill',type:'fill',source:'scan-cells',paint:{'fill-color':['get','color'],'fill-opacity':['get','opacity']}},'draft-path');
        m.addLayer({id:'scan-cells-line',type:'line',source:'scan-cells',paint:{'line-color':['get','color'],'line-width':CELL_WIDTH}},'draft-path');
        m.addLayer({id:'scan-cells-selected',type:'line',source:'scan-cells',filter:['==',['get','id'],''],paint:{'line-color':'#ffffff','line-width':2.5}});
        m.addSource('observed-flight',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
        m.addLayer({id:'observed-flight-line',type:'line',source:'observed-flight',paint:{'line-color':'#72ddfa','line-width':ROUTE_WIDTH}});
        setReady(true);
      });
      m.on("error", () =>
        setError("Some map or elevation data is unavailable."),
      );
      const observer = new ResizeObserver(() => m.resize());
      observer.observe(element.current);
      return () => {
        observer.disconnect();
        m.remove();
        map.current = null;
      };
    } catch {
      setError(
        "Interactive map requires WebGL. Try another supported browser.",
      );
    }
    return () => m?.remove();
  }, []);
  useEffect(() => {
    if (!ready) return;
    if (activeBasemap.current === basemap) return;
    const m = map.current, value = BASEMAPS[basemap];
    m.removeLayer("basemap");
    m.removeSource("basemap");
    m.addSource("basemap", value.source);
    m.addLayer({ id: "basemap", type: "raster", source: "basemap", paint: value.paint }, "context-fill");
    activeBasemap.current = basemap;
    setError("");
  }, [basemap, ready]);
  useEffect(() => {
    if (!ready) return;
    const m = map.current;
    if (three) {
      if (!m.getSource("terrain-dem"))
        m.addSource("terrain-dem", {
          type: "raster-dem",
          tiles: [
            "https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png",
          ],
          tileSize: 256,
          encoding: "terrarium",
          maxzoom: 12,
        });
      m.setTerrain({ source: "terrain-dem", exaggeration: 1 });
    } else m.setTerrain(null);
    m.easeTo({
      pitch: three ? 58 : 0,
      bearing: three ? -18 : 0,
      duration: 500,
    });
  }, [ready, three]);
  useEffect(()=>{
    if(!ready||!map.current?.getSource('context')||!map.current?.getSource('scan-cells'))return;
    const m=map.current;
    m.getSource('context').setData(regionFeatures(regions,domain,clock));
    m.setPaintProperty('context-fill','fill-color',['get','color']);
    m.setPaintProperty('context-line','line-color',['get','color']);
    m.setPaintProperty('context-fill','fill-opacity',cellMode==='context'?.22:.035);
    const features=cellFeatures(cells,coverage,cellMode,cellContext);
    if(selectable&&selectedCells?.length)for(const f of features.features){if(!selectedCells.includes(f.properties.id))f.properties.opacity=.025;else {f.properties.opacity=.35;f.properties.color='#eac477';}}
    m.getSource('scan-cells').setData(features);
    m.setFilter('context-selected',['==',['get','id'],selectedRegion?.id||'']);
    m.getSource('selected-region').setData({type:'FeatureCollection',features:selectedRegion?.geometry?[{type:'Feature',properties:{},geometry:selectedRegion.geometry}]:[]});
    m.setFilter('scan-cells-selected',['==',['get','id'],selectedCell||'']);
  },[regions,domain,clock,ready,cells,coverage,cellMode,selectedCell,cellContext,selectedCells,selectable,selectedRegion?.id]);
  useEffect(() => {
    if(!ready||!map.current?.getSource('draft-plan')) return;
    const m=map.current;
    m.getSource('draft-plan').setData(plan?.geometry || {type:'FeatureCollection',features:[]});
    if(plan){const ring=plan.geometry.features.find(f=>f.properties.kind==='boundary').geometry.coordinates[0];m.fitBounds([ring[0],ring[2]],{padding:75,maxZoom:MAX_MAP_ZOOM,duration:400});}
  }, [plan,ready]);
  useEffect(()=>{if(!ready)return;const m=map.current;m.getSource('context-extra').setData(overlayFeatures(overlayData,domain==='Pyro'?layers:{}));},[ready,overlayData,layers,domain]);
  useEffect(()=>{if(!ready||!selectedRegion?.geometry||focusMission)return;const bounds=geometryBounds(selectedRegion.geometry);if(bounds)map.current.fitBounds(bounds,{padding:45,maxZoom:12,duration:500});},[ready,selectedRegion?.id,focusMission]);
  useEffect(()=>{if(!ready)return;const m=map.current;if(m.getLayer('rainfall'))m.removeLayer('rainfall');if(m.getSource('rainfall'))m.removeSource('rainfall');if(domain==='Pyro'&&layers?.rain&&rain?.fresh){m.addSource('rainfall',{type:'raster',tiles:[rain.tileURL],tileSize:256,maxzoom:13,attribution:'NOAA MRMS · 24 h QPE estimate'});m.addLayer({id:'rainfall',type:'raster',source:'rainfall',paint:{'raster-opacity':.42}},'context-fill');}},[ready,rain?.tileURL,rain?.fresh,layers?.rain,domain]);
  useEffect(()=>{if(!ready)return;const features=[];if(domain==='Pyro'&&layers?.drainage)for(const cell of cells){const t=cellContext[cell.id]?.terrain;if(!Number.isFinite(t?.aspectDegrees))continue;const a=t.aspectDegrees*Math.PI/180,d=.00025,dx=Math.sin(a)*d/Math.cos(cell.center[1]*Math.PI/180),dy=Math.cos(a)*d,end=[cell.center[0]+dx,cell.center[1]+dy];features.push({type:'Feature',properties:{},geometry:{type:'MultiLineString',coordinates:[[cell.center,end],[[end[0]-dx*.3-dy*.25,end[1]-dy*.3+dx*.25],end,[end[0]-dx*.3+dy*.25,end[1]-dy*.3-dx*.25]]]}});}map.current.getSource('downhill').setData({type:'FeatureCollection',features});},[ready,cellContext,cells,layers?.drainage,domain]);
  useEffect(() => {
    marker.current?.remove();
    if (target && map.current)
      marker.current = new maplibregl.Marker({ color: "#f4a112",scale:plan?.revision?.4:1 })
        .setLngLat(target)
        .setPopup(
          new maplibregl.Popup().setText(
            "Local planning target · not an aircraft",
          ),
        )
        .addTo(map.current);
    return () => marker.current?.remove();
  }, [target, ready, plan]);
  useEffect(()=>{
    if(!ready||!fieldObservation?.point)return;
    const el=document.createElement('div');el.className='field-observation-marker';el.setAttribute('role','img');el.setAttribute('aria-label',fieldObservation.label);el.textContent='!';
    const observationMarker=new maplibregl.Marker({element:el}).setLngLat(fieldObservation.point).setPopup(new maplibregl.Popup().setText(fieldObservation.label)).addTo(map.current);
    return()=>observationMarker.remove();
  },[ready,fieldObservation?.id,fieldObservation?.label,fieldObservation?.point]);
  useEffect(()=>{
    labels.current.forEach(label=>label.marker.remove());labels.current=[];
    if(!ready)return;
    for(const cell of cells){
      const button=document.createElement('button');button.className='map-cell-label';button.type='button';button.textContent=cell.alias;button.setAttribute('aria-label','Inspect cell '+cell.alias+' '+cell.id);button.onclick=e=>{e.stopPropagation();interaction.current.setSelectedCell(cell.id);if(interaction.current.selectable)interaction.current.onCells(old=>old.includes(cell.id)?old.filter(x=>x!==cell.id):[...old,cell.id]);};
      const label=new maplibregl.Marker({element:button,anchor:'center'}).setLngLat(cell.center).addTo(map.current);labels.current.push({marker:label,button,id:cell.id,alias:cell.alias});
    }
    return()=>{labels.current.forEach(label=>label.marker.remove());labels.current=[];};
  },[cells,ready]);
  useEffect(()=>{
    if(!ready)return;const m=map.current;let animation;
    const resizeSymbols=()=>{
      for(const item of labels.current){
        const cell=cells.find(c=>c.id===item.id),r=coverage[item.id];
        const span=cellScreenSpan((cell?.geometry.coordinates[0]||[]).map(p=>m.project(p)));
        const detail=cellLabelDetail(span,item.id===selectedCell);
        item.button.hidden=detail==='hidden';
        item.button.textContent=item.alias+(r&&detail==='coverage'?'\n'+Math.round(r.coveragePct)+'%':'');
        item.button.title=r?'Reported '+r.coveragePct+'% · '+r.state:'Coverage unknown';
      }
      if(aircraft.current){const el=aircraft.current.getElement();el.style.setProperty('--drone-size',droneSymbolPixels(m.getZoom())+'px');el.classList.toggle('overview',m.getZoom()<15);}
    };
    const schedule=()=>{cancelAnimationFrame(animation);animation=requestAnimationFrame(resizeSymbols);};
    resizeSymbols();for(const event of ['zoom','rotate','pitch'])m.on(event,schedule);
    return()=>{cancelAnimationFrame(animation);for(const event of ['zoom','rotate','pitch'])m.off(event,schedule);};
  },[coverage,cells,ready,selectedCell]);
  useEffect(()=>{
    if(!ready)return;const m=map.current;
    if(flight?.data){
      const first=positionValid(flight.frame)?flight.frame:flight.data.samples.find(positionValid);
      if(first&&(flightCamera.current?.key!==flight.data.key||flightCamera.current?.mobile!==mobile||flightCamera.current?.focus!==flight.focus)){
        if(!flightCamera.current)flightCamera.current={center:m.getCenter(),zoom:m.getZoom(),key:flight.data.key,mobile,focus:flight.focus};
        else {flightCamera.current.key=flight.data.key;flightCamera.current.mobile=mobile;flightCamera.current.focus=flight.focus;}
        m.resize();
        m.easeTo({center:[first.longitude_deg,first.latitude_deg],zoom:Math.min(17,MAX_MAP_ZOOM),duration:0,offset:(mobile||m.getContainer().clientWidth<650)?[0,-Math.min(180,Math.max(0,(m.getContainer().clientHeight-220)/2))]:[0,0]});
      }
    }else if(!flight?.source&&flightCamera.current){m.easeTo({center:flightCamera.current.center,zoom:flightCamera.current.zoom,duration:400});flightCamera.current=null;}
  },[ready,flight?.data?.key,flight?.source,mobile,flight?.focus]);
  useEffect(()=>{
    if(!ready||!map.current?.getSource('observed-flight'))return;const m=map.current,s=flight?.frame;
    m.getSource('observed-flight').setData(flight?.data?observedTrack(flight.data.samples,flight.time):{type:'FeatureCollection',features:[]});
    if(!positionValid(s)){aircraft.current?.remove();aircraft.current=null;return;}
    if(!aircraft.current){
      const el=document.createElement('div');el.className='aircraft-marker';el.setAttribute('role','img');
      el.style.setProperty('--drone-size',droneSymbolPixels(m.getZoom())+'px');
      el.innerHTML='<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M16 16l16 16M16 32l16-16"/><circle cx="13" cy="13" r="9"/><circle cx="35" cy="13" r="9"/><circle cx="13" cy="35" r="9"/><circle cx="35" cy="35" r="9"/><rect x="19" y="17" width="10" height="14" rx="3"/></svg><span></span>';
      aircraft.current=new maplibregl.Marker({element:el,anchor:'center'}).setLngLat([s.longitude_deg,s.latitude_deg]).addTo(m);
    }
    const el=aircraft.current.getElement();el.classList.toggle('stale',!flight.replaying&&!flight.live);
    const label=(Number.isFinite(s.relative_altitude_m)?s.relative_altitude_m.toFixed(1)+' m':'Altitude unknown')+' · '+(flight.replaying?'recorded':flight.live?'live':'last known');
    el.querySelector('span').textContent=label;el.setAttribute('aria-label','Observed simulator drone · '+label);aircraft.current.setLngLat([s.longitude_deg,s.latitude_deg]);
  },[ready,flight?.frame,flight?.time,flight?.live]);
  useEffect(()=>()=>{aircraft.current?.remove();},[]);
  return (
    <div className="map-surface">
      <div
        ref={element}
        className="map-canvas"
        aria-label={
          three ? "Interactive 3D planning terrain" : "Interactive planning map"
        }
      />
      {selectable&&cells.length>0&&<button className="focus-survey outline" onClick={()=>{const b=geometryBounds(surveyBounds.current);if(b)map.current.fitBounds(b,{padding:65,maxZoom:MAX_MAP_ZOOM,duration:400});}}>Focus survey cells</button>}
      <WindLayer map={ready?map.current:null} wind={wind} enabled={domain==='Pyro'&&layers?.wind&&!offline} mobile={mobile}/>
      {domain==='Pyro'&&layers?.wind&&wind&&<span className="wind-note">Wind from {Math.round(wind.fromDegrees)}° · {wind.speedMps.toFixed(1)} m/s · {wind.label}</span>}
      {(offline || error) && (
        <div className="map-warning" role="status">
          {offline
            ? "Offline · map tiles and live telemetry unavailable"
            : error}
        </div>
      )}
      {three && (
        <div className="terrain-label">
          {flight?.source?'Terrain view · aircraft altitude shown separately':'Terrain view · no aircraft simulation'}
        </div>
      )}
    </div>
  );
}
export default function MapWorkspace(props) {
  const reviewing=props.runtimeProposal&&['awaiting_approval','approved'].includes(props.runtimeProposal.action_status);
  const receivedPlan=reviewing?props.runtimeProposal.plan:props.flight?.data?.manifest||props.runtimeProposal?.plan;
  // A reviewed plan is immutable for its content hash; telemetry refreshes do not rebuild markers/camera.
  const runtimePlan=useMemo(()=>receivedPlan,[receivedPlan?.content_hash]);
  const effectivePlanId=runtimePlan?.request_id||props.planId;
  const effectivePlan=useMemo(()=>{
    if(!runtimePlan)return props.plan;
    const indexed=buildMissionCells({runtimeCellIds:runtimePlan.cell_index?.cell_ids||[]});
    const coordinates=indexed.cells.flatMap(c=>c.geometry.coordinates[0]);
    const route=runtimePlan.waypoints.map(p=>[p.longitude_deg,p.latitude_deg]);
    const all=coordinates.length?coordinates:route,west=Math.min(...all.map(p=>p[0])),east=Math.max(...all.map(p=>p[0])),south=Math.min(...all.map(p=>p[1])),north=Math.max(...all.map(p=>p[1]));
    return {...props.plan,revision:runtimePlan.revision,runtimeCellIds:runtimePlan.cell_index?.cell_ids||[],
      geometry:{type:'FeatureCollection',features:[
       {type:'Feature',properties:{kind:'boundary'},geometry:{type:'Polygon',coordinates:[[[west,south],[east,south],[east,north],[west,north],[west,south]]]}},
       {type:'Feature',properties:{kind:'path'},geometry:{type:'LineString',coordinates:route}}
      ]}};
  },[runtimePlan,props.plan]);

  const [cellMode,setCellMode]=useState('coverage'),[selectedCell,setSelectedCell]=useState(null);
  const indexed=useMemo(()=>{try{return {...buildMissionCells(effectivePlan),error:''};}catch(e){return {cells:[],resolution:null,error:e.message};}},[effectivePlan]);
  const scope=useMemo(()=>({planId:effectivePlanId,revision:effectivePlan?.revision,cells:indexed.cells}),[effectivePlanId,effectivePlan,indexed.cells]);
  const feed=useCoverageFeed(scope,props.flight?.data?.coverage);
  const [terrain,setTerrain]=useState({}),[terrainStatus,setTerrainStatus]=useState('Select a plan to calculate terrain.');
  useEffect(()=>{setTerrain({});if(!indexed.cells.length)return;const controller=new AbortController();setTerrainStatus('Loading terrain elevations…');loadCellTerrain(indexed.cells,controller.signal).then(v=>{if(!controller.signal.aborted){setTerrain(v);setTerrainStatus('DEM-derived terrain · coarse estimate, not clearance validation.');}}).catch(e=>{if(e.name!=='AbortError')setTerrainStatus('Terrain unavailable: '+e.message);});return()=>controller.abort();},[indexed.cells]);
  const cellContext=useMemo(()=>{const wind=observedWind(props.weather,feed.clock);return Object.fromEntries(indexed.cells.map(c=>[c.id,{terrain:terrain[c.id],rating:props.domain==='Avy'?issuedRating(c,props.regions,feed.clock):null,fire:props.domain==='Pyro'?fireReconPriority(c,props.regions,wind,feed.clock):null}]));},[indexed.cells,terrain,props.regions,props.domain,props.weather,feed.clock]);
  useEffect(()=>setSelectedCell(null),[effectivePlanId]);
  const visibleRecords=props.flight?.replaying?Object.fromEntries(Object.entries(feed.records).filter(([,r])=>Date.parse(r.observedAt)<=props.flight.time)):feed.records;
  const visibleFeed={...feed,records:visibleRecords};
  const cellProps={cells:indexed.cells,coverage:visibleRecords,cellMode,selectedCell,setSelectedCell,domain:props.domain,clock:feed.clock,cellContext};
  const [basemap, setBasemap] = useState(() => savedBasemap(localStorage));
  const firstFlightPoint=props.flight?.data?.samples.find(positionValid);
  const globalFlight=firstFlightPoint&&(firstFlightPoint.longitude_deg < -179 || firstFlightPoint.longitude_deg > -64 || firstFlightPoint.latitude_deg < 18 || firstFlightPoint.latitude_deg > 72);
  const effectiveBasemap='imagery';
  function chooseBasemap(value) {
    setBasemap(value);
    try { localStorage.setItem(BASEMAP_KEY, value); } catch { /* Preference persistence is optional. */ }
  }
  return (
    <div className={props.mode === "Split view" ? "maps split" : "maps"}>
      <SingleMap key="primary" {...props} plan={effectivePlan} {...cellProps} basemap={effectiveBasemap} three={props.mode === "3D"} />
      <div className="basemap-controls">
        <div className="basemap-switch" role="group" aria-label="Basemap">
          {Object.entries(BASEMAPS).map(([id, value]) => (
            <button key={id} aria-pressed={effectiveBasemap === id} onClick={() => chooseBasemap(id)}>
              {value.label}
            </button>
          ))}
        </div>
        <a className="basemap-note" href={BASEMAPS[effectiveBasemap].href} target="_blank" rel="noreferrer">
          {BASEMAPS[effectiveBasemap].note} ↗
        </a>
      </div>
      {(!props.flight?.source||runtimePlan)&&<ScanCoverage mobile={props.mobile} compact={props.focusMission} selectionCount={props.focusMission&&!runtimePlan?props.selectedCells?.length??0:null} cells={indexed.cells} resolution={indexed.resolution} error={indexed.error} planId={effectivePlanId} revision={effectivePlan?.revision} domain={props.domain} mode={cellMode} setMode={setCellMode} selected={selectedCell} setSelected={setSelectedCell} feed={visibleFeed} context={cellContext} terrainStatus={terrainStatus}/>}
      {globalFlight&&<span className="global-flight-note">Historical flight outside USGS imagery coverage · coordinates preserved</span>}
      <FlightHUD feed={props.flight}/>
      {props.mode === "Split view" && (
        <SingleMap key="terrain" {...props} plan={effectivePlan} {...cellProps} basemap={effectiveBasemap} three />
      )}
    </div>
  );
}
