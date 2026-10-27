import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Radio, ClipboardList, Drone, ChartNoAxesColumn, Settings, Menu, ChevronRight, User, ExternalLink, Download, X, ChevronDown, LogOut } from 'lucide-react';
import { client, orgPath } from "./client.js";
import { readDrafts, writeDrafts, download } from "./drafts.js";
import { DraftList, ReadPanel, LoginDialog } from "./WorkspacePanels.jsx";
const MapWorkspace = lazy(() => import("./MapWorkspace.jsx"));
import { MissionPanel, PlanReview, DronePanel, RadioExample } from './MissionPanels.jsx';
import SatchyWorkspace,{AuthorizedFleet} from './SatchyWorkspace.jsx';
import {useFlightFeed,FlightControls} from './FlightConsole.jsx';
import { SCENARIOS, createSurveyPlan } from './mission-planning.js';
import OperationsConsole from "./OperationsConsole.jsx";
import EnvironmentPanel from "./EnvironmentPanel.jsx";
import OperationContext,{useOperationContext,DEFAULT_LAYERS} from "./OperationContext.jsx";
import {geometryPoint} from "./operation-geometry.js";
const NAV = [['Mission', Crosshair], ['Drones & payloads', Drone], ['Flight plans', ClipboardList], ['Radio & Satchy', Radio], ['Reports', ChartNoAxesColumn]];
export default function App() {
  const [section, setSection] = useState("Mission"),
    [menu, setMenu] = useState(false),
    [panel, setPanel] = useState(false),
    [drawer, setDrawer] = useState(false),
    [login, setLogin] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine),
    [session, setSession] = useState(null),
    [sessionError, setSessionError] = useState(""),
    [org, setOrg] = useState(""),
    [drafts, setDrafts] = useState(() => readDrafts(localStorage));
  const [scenarioId, setScenarioId] = useState('snow-survey'),
    [altitude, setAltitude] = useState('60'),
    [surveyWidth, setSurveyWidth] = useState('200'),
    [observation, setObservation] = useState(null),
    [review, setReview] = useState(null),
    [target, setTarget] = useState(null),
    [notice, setNotice] = useState(""),
    [privateData, setPrivateData] = useState(null),
    [contextDomain,setContextDomain] = useState(null),
    [weather,setWeather] = useState(null),
    [fireRegions,setFireRegions] = useState(null),
    [dataError, setDataError] = useState(""),
    [loading, setLoading] = useState(false),
    [mode, setMode] = useState("Map"),
    [width, setWidth] = useState(340),
    [update, setUpdate] = useState(null);
  const [selectedRegion,setSelectedRegion]=useState(null),[selectedCells,setSelectedCells]=useState([]),[layers,setLayers]=useState(DEFAULT_LAYERS);
  const flight=useFlightFeed({org,signedIn:!!session?.user,offline});
  const sequence = useRef(0);
  const [mobile, setMobile] = useState(
    () => matchMedia("(max-width:800px)").matches,
  );
  useEffect(() => {
    const m = matchMedia("(max-width:800px)");
    const change = () => setMobile(m.matches);
    m.addEventListener("change", change);
    change();
    return () => m.removeEventListener("change", change);
  }, []);
  async function refresh() {
    try {
      const value = await client.workspaceSession();
      setSession(value);
      setSessionError("");
      setOrg((old) =>
        value.organizations.some((o) => o.id === old)
          ? old
          : value.organizations[0]?.id || "",
      );
    } catch {
      setSession(null);
      setSessionError("Workspace unavailable");
    }
  }
  useEffect(() => {
    refresh();
    const change = () => setOffline(!navigator.onLine);
    window.addEventListener("online", change);
    window.addEventListener("offline", change);
    let active = true;
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.ready.then((r) => {
        if (!active) return;
        if (r.waiting) setUpdate(r);
        r.addEventListener("updatefound", () => {
          const w = r.installing;
          w?.addEventListener("statechange", () => {
            if (w.state === "installed" && navigator.serviceWorker.controller)
              setUpdate(r);
          });
        });
      });
    return () => {
      active = false;
      window.removeEventListener("online", change);
      window.removeEventListener("offline", change);
    };
  }, []);
  useEffect(() => {
    sequence.current++;
    setPrivateData(null);
    setContextDomain(null);
    setDataError("");
    setLoading(false);
  }, [org, section, scenarioId]);
  useEffect(() => { setReview(null); setNotice(''); }, [target, scenarioId, altitude, surveyWidth, observation, org]);
  function chooseScenario(id){
    if(SCENARIOS.find(s=>s.id===id)?.domain!==SCENARIOS.find(s=>s.id===scenarioId)?.domain){setTarget(null);setSelectedRegion(null);setSelectedCells([]);setWeather(null);}
    setScenarioId(id);setReview(null);
  }
  function chooseTarget(point){setTarget(point);setSelectedCells([]);}
  function chooseRegion(region){setSelectedRegion(region);setSelectedCells([]);setReview(null);if(region){const p=geometryPoint(region.geometry);if(p)setTarget(p);}}
  function chooseIncident(incident){setSelectedRegion(incident);setTarget(incident.point);setSelectedCells([]);setReview(null);}
  function generate() {
    try {
      if (drafts.length >= 20) throw Error('Export or remove an older draft before creating another.');
      const draft=createSurveyPlan({scenarioId,target,altitude,width:surveyWidth,region:selectedRegion,selectedCellIds:selectedCells,observation:observation?{...observation,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone}:null});
      const next=[draft,...drafts]; writeDrafts(localStorage,next); setDrafts(next); setReview(draft); setNotice('Local draft saved. Nothing has been dispatched.');
    } catch(error) { setNotice(error.message); }
  }
  function removeDraft(id) {
    try {
      const next = drafts.filter((d) => d.id !== id);
      writeDrafts(localStorage, next);
      setDrafts(next);
      if(review?.id===id) setReview(null);
    } catch {
      setNotice("Could not update local storage.");
    }
  }
  async function loadData() {
    if (!org || offline) return;
    const id = ++sequence.current;
    setLoading(true);
    setDataError("");
    try {
      let value;
      if (section === "Radio & Satchy")
        value = await client.request(
          orgPath(org) + "/radio/events?limit=25&offset=0",
        );
      else if (section === "Reports")
        value = await client.listSatchyRuns(org, 20);
      else if (section === "Mission")
        value = await client.getWorkspaceModuleCatalog(org, {
          source: scenario.domain === "Avy" ? "avy_na" : "wfigs",
          fire_states: scenario.domain === "Pyro" && weather?.state ? [weather.state] : undefined,
        });
      else value = await client.getWorkspace(org);
      if (sequence.current === id) {setPrivateData(value);setContextDomain(section==='Mission'?scenario.domain:null);}
    } catch (e) {
      if (sequence.current === id) setDataError(e.message);
    } finally {
      if (sequence.current === id) setLoading(false);
    }
  }
  async function logout() {
    try {
      await client.logoutWorkspace(session.csrf_token);
      sequence.current++;
      setSession(null);
      setPrivateData(null);
      setOrg("");
      await refresh();
    } catch (e) {
      setNotice(e.message);
    }
  }
  function select(name) {
    setSection(name);
    setMenu(false);
    setPanel(true);
    setNotice("");
  }
  function resize(event) {
    const start = event.clientX,
      before = width;
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (e) =>
      setWidth(Math.max(290, Math.min(520, before + e.clientX - start)));
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }
  const scenario = SCENARIOS.find(s=>s.id===scenarioId);
  const mapDomain=SCENARIOS.find(s=>s.id===review?.plan?.scenarioId)?.domain||scenario.domain;
  const opData=useOperationContext(scenario.domain,target,offline);
  const regions = mapDomain==='Pyro'?(opData.pyro?.regions||[]):(opData.avy?.regions||[]),
    signedIn = !!session?.user;
  const showMissionOverlay=!flight.source||!!review?.runtime&&flight.source.type!=='replay';
  const planningPreview=useMemo(()=>{if(review||!target)return null;try{return createSurveyPlan({scenarioId,target,altitude,width:surveyWidth,region:selectedRegion});}catch{return null;}},[scenarioId,target,altitude,surveyWidth,selectedRegion,review]);
  const operationalContext=<OperationContext domain={scenario.domain} data={opData} selectedRegion={selectedRegion} onRegion={chooseRegion} onIncident={chooseIncident} layers={layers} setLayers={setLayers} offline={offline}/>;
  const context = <ReadPanel section={section==='Mission'?scenario.domain+' Context':section} signedIn={signedIn} offline={offline} org={org} data={privateData} error={dataError} loading={loading} load={loadData} login={()=>setLogin(true)}/>;
  return <div className="app" style={{'--inspector-width':width+'px'}}>
    <header><button className="icon-button mobile-menu" aria-label="Open navigation" aria-expanded={menu} aria-controls="main-navigation" onClick={()=>{setMenu(!menu);setPanel(false);}}><Menu/></button><a className="identity" href="https://terrasatch.com" target="_blank" rel="noreferrer"><img src="/terrasatch-logo.png" alt=""/>TERRASATCH</a><span className="product">sUAS OPERATIONS</span><div className="operation-switch" role="group" aria-label="Operation mode">{['Avy','Pyro'].map(d=><button key={d} aria-pressed={scenario.domain===d} onClick={()=>chooseScenario(SCENARIOS.find(s=>s.domain===d).id)}>{d}TS</button>)}</div><div className="header-actions"><span className="connection" data-state={flight.connection} title={Number.isFinite(flight.sampleAge)?'Last observation: '+(flight.sampleAge/1000).toFixed(1)+' s ago':undefined}><i/>{flight.connectionLabel}</span><button className="outline" onClick={()=>setLogin(true)}><User size={15}/>{signedIn?session.user.name:'Open workspace'}</button></div></header>
    <nav id="main-navigation" className={menu?'navigation open':'navigation'} aria-label="Main navigation" inert={mobile&&!menu} aria-hidden={mobile&&!menu}>{NAV.map(([name,Icon])=><button key={name} aria-current={section===name?'page':undefined} onClick={()=>select(name)}><Icon size={20} strokeWidth={1.5}/><span>{name}</span></button>)}<button className="settings-nav" aria-current={section==='Settings'?'page':undefined} onClick={()=>select('Settings')}><Settings size={20} strokeWidth={1.5}/><span>Settings</span></button></nav>
    <main><aside className={panel?'inspector visible':'inspector'}><button className="icon-button close-panel" aria-label="Close mission panel" onClick={()=>setPanel(false)}><X/></button>
    {section==='Mission'?<>{review?<><PlanReview draft={review} close={()=>setReview(null)}/><OperationsConsole draft={review} org={org} session={session} offline={offline} feed={flight} login={()=>setLogin(true)} onPrepared={p=>setReview(old=>old?{...old,runtime:p}:old)}/></>:<MissionPanel scenario={scenario} chooseScenario={chooseScenario} target={target} altitude={altitude} setAltitude={setAltitude} surveyWidth={surveyWidth} setSurveyWidth={value=>{setSurveyWidth(value);setSelectedCells([]);}} observation={observation} setObservation={setObservation} generate={generate} context={operationalContext} selectedCells={selectedCells.length} cellCount={planningPreview?.plan.cellIndex.cellIds.length||0}/>}<EnvironmentPanel target={review?.target||target} offline={offline} onWeather={setWeather}/></>:section==='Drones & payloads'?<><h1>Drones &amp; payloads</h1><p className='intro'>Flight evidence and authorized equipment.</p><FlightControls feed={flight} signedIn={signedIn} offline={offline} org={org}/><AuthorizedFleet org={org} signedIn={signedIn} offline={offline} login={()=>setLogin(true)}/><details className="mission-detail"><summary>Mission equipment requirements</summary><DronePanel scenario={scenario}/></details></>:section==='Flight plans'?<><h1>Flight plans</h1><p className="intro">Local proposals for pilot review.</p><DraftList drafts={drafts} remove={removeDraft} review={d=>{setReview(d);select('Mission');}}/></>:section==='Radio & Satchy'?<><h1>Radio &amp; Satchy</h1><p className="intro">Human request. Plan readback. Human approval.</p><button className='primary draft-button' onClick={()=>setDrawer(true)}>Connect Satchy &amp; radio sources</button><p className='hint'>Read received radio, send workspace text and inspect real Satchy runs.</p>{context}<RadioExample/></>:section==='Reports'?<><h1>Reports</h1><p className="intro">Source-linked runs from your workspace.</p><button className='outline draft-button' onClick={flight.replay}>Play verified PX4 flight</button>{context}</>:<><h1>Settings</h1><p className="intro">Workspace and device storage.</p><h2>Workspace</h2>{signedIn?<><label htmlFor="organization">Organization</label><select id="organization" value={org} onChange={e=>setOrg(e.target.value)}>{session.organizations.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select><button className="outline draft-button" onClick={logout}><LogOut size={16}/>Sign out</button></>:<button className="outline draft-button" onClick={()=>setLogin(true)}>Sign in to workspace</button>}<section className="panel-section"><h2>Local drafts</h2><p>{drafts.length} of 20 stored on this device.</p><button className="outline draft-button" onClick={()=>download(drafts,'terrasatch-local-drafts.json')} disabled={!drafts.length}><Download size={16}/>Export drafts</button></section><section className="panel-section"><h2>Application updates</h2><p>{update?'An update is ready. Saved drafts remain on this device.':'You are using the current application shell.'}</p><button className="outline draft-button" disabled={!update} onClick={()=>{navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload(),{once:true});update.waiting?.postMessage('ACTIVATE_UPDATE');}}>Apply update</button></section></>}
    {notice&&<p className="feedback" role="status">{notice}</p>}{sessionError&&section==='Settings'&&<p className="hint">{sessionError}</p>}</aside>
    <div className="divider" role="separator" tabIndex={0} aria-label="Resize mission panel" aria-orientation="vertical" aria-valuenow={width} aria-valuemin={290} aria-valuemax={520} onPointerDown={resize} onKeyDown={e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();setWidth(w=>Math.max(290,Math.min(520,w+(e.key==='ArrowRight'?20:-20))));}}}/>
    <section className="map-panel" aria-label="Persistent planning map" inert={mobile&&(panel||menu)}><div className="map-heading"><div><h2>{flight.source?'Simulator flight view':scenario.domain==='Avy'?'AvyTS · UAC reconnaissance':'PyroTS · wildfire reconnaissance'}</h2><p>{flight.source?(flight.source.type==='api'?'Authorized simulator telemetry':'Observed PX4 positions · satellite imagery'):review?'Draft survey path · not terrain-validated':'Planning map · no live drone'}</p></div><div className="view-switch" aria-label="Map view">{['Map','3D','Split view'].map(v=><button key={v} aria-pressed={mode===v} onClick={()=>setMode(v)}>{v}</button>)}</div></div><Suspense fallback={<div className="map-loading">Loading planning map…</div>}><MapWorkspace mode={mode} target={flight.source?null:review?.target||target} setTarget={flight.source?()=>{}:chooseTarget} regions={regions} selectedRegion={selectedRegion} onRegion={chooseRegion} overlayData={opData.pyro} rain={opData.rain} layers={layers} selectedCells={selectedCells} onCells={setSelectedCells} selectable={!review&&!flight.source} offline={offline} plan={showMissionOverlay?(review?.plan||planningPreview?.plan):null} runtimeProposal={showMissionOverlay?review?.runtime:null} planId={showMissionOverlay?(review?.id||planningPreview?.id):null} domain={mapDomain} weather={weather} flight={flight} mobile={mobile}/></Suspense><button className="mobile-panel-button primary" onClick={()=>setPanel(true)}>Mission panel</button></section></main>
    <footer><button className="assistant-toggle" onClick={()=>setDrawer(!drawer)} aria-expanded={drawer}><img className="assistant-emblem" src="/satchy.png" alt="Satchy"/><strong>SATCHY ASSISTANT</strong><span className="footer-copy">Plan with your crew. Review before deployment.</span>{drawer?<ChevronDown/>:<ChevronRight/>}</button></footer>
    {drawer&&<section className="assistant-drawer"><div><h2><img className="assistant-emblem" src="/satchy.png" alt=""/> Satchy Assistant</h2><button className="icon-button" aria-label="Close Satchy assistant" onClick={()=>setDrawer(false)}><X/></button></div><SatchyWorkspace org={org} session={session} offline={offline} login={()=>setLogin(true)} review={review}/></section>}
    {login&&<LoginDialog session={session} offline={offline} close={()=>setLogin(false)} connected={async()=>{await refresh();setLogin(false);}}/>}
  </div>;
}
