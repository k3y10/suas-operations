import datetime as dt
import json
from pathlib import Path
import sys
import tempfile
from uuid import uuid4

sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'outputs/simulator-qa'))
from runtime_worker import freeze_mission
from runtime_supervisor import runnable_session
from runtime_gateway import Gateway

with tempfile.TemporaryDirectory(prefix='terrasatch-recording-') as temporary:
    work=Path(temporary);sid=str(uuid4());mid=str(uuid4());directory=work/('session-'+sid);directory.mkdir()
    scope={'organization_id':str(uuid4()),'owner_user_id':str(uuid4())}
    config={**scope,'session_id':sid,'id':sid,'directory':str(directory),
            'expires_at':(dt.datetime.now(dt.timezone.utc)+dt.timedelta(minutes=5)).isoformat()}
    (directory/'session.json').write_text(json.dumps(config))
    assert runnable_session(config,directory)
    runtime={'missions':{mid:{'state':'completed','mission_finished':True,'airborne_observed':True,
             'landing_observed':True,'disarmed_observed':True}},
             'packet':{'samples':[{'mission_id':mid,'latitude_deg':40.599388,'longitude_deg':-111.643037}],
                       'coverage':[{'planId':mid,'cellId':'8c2696ac36d33ff','coveragePct':100}]}}
    (directory/'state.json').write_text(json.dumps(runtime));assert not runnable_session(config,directory)
    freeze_mission(directory,mid)
    original=(directory/('mission-'+mid+'.json')).read_bytes()
    # Simulate the later idle buffer and an empty live state after a service restart.
    (directory/'state.json').write_text(json.dumps({'missions':{},'packet':{'samples':[],'coverage':[]}}))
    freeze_mission(directory,mid)
    assert (directory/('mission-'+mid+'.json')).read_bytes()==original
    gateway=Gateway(work,'not-a-real-token');owned=gateway.mission_session(scope,mid)
    captured=gateway.runtime(owned,mid)
    assert captured['packet']['mode']=='recorded' and captured['packet']['connected'] is False
    assert captured['packet']['coverage'][0]['coveragePct']==100 and len(captured['packet']['samples'])==1
    try:gateway.mission_session({**scope,'owner_user_id':str(uuid4())},mid)
    except LookupError:pass
    else:raise AssertionError('Another owner could read the capture')
    (directory/'state.json').unlink();(directory/'stop.json').write_text('{}')
    assert not runnable_session(config,directory)
    (directory/'stop.json').unlink();config['expires_at']=(dt.datetime.now(dt.timezone.utc)-dt.timedelta(seconds=1)).isoformat()
    assert not runnable_session(config,directory)
print('Recording checks passed: terminal capture survives buffer/restart, remains immutable and owner-scoped; old leases never replay.')
