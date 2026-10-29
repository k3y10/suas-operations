import json
from pathlib import Path
import sys
import tempfile
import time
from unittest.mock import Mock, patch
from uuid import uuid4

source=Path(__file__).resolve().parents[2]/'outputs/simulator-qa'
sys.path.insert(0,str(source))
from runtime_gateway import Gateway, utc

with tempfile.TemporaryDirectory(prefix='terrasatch-lifecycle-') as temporary:
 gateway=Gateway(Path(temporary),'not-a-real-token')
 gateway.process=Mock();gateway.process.poll.return_value=None
 gateway.validated=lambda:True
 scope={'organization_id':str(uuid4()),'owner_user_id':str(uuid4())}
 body={'request_id':str(uuid4()),'site_id':str(uuid4()),'asset_id':str(uuid4()),
       'home':{'latitude':40.5884,'longitude':-111.6384},'lifetime_seconds':1800}
 with patch('runtime_gateway.threading.Thread') as thread:
  began=time.monotonic();lease=gateway.create(scope,body)
  assert time.monotonic()-began<.1 and lease['status']=='starting'
  assert not (Path(temporary)/'current-session.json').exists()
  assert gateway.create(scope,body)['id']==lease['id'] and thread.call_count==1
  try:gateway.create(scope,{**body,'request_id':str(uuid4())})
  except RuntimeError:pass
  else:raise AssertionError('Starting lease was replaced')
  old=gateway.session
  state={'ready':True,'state':{'connected':True,'observed_at':utc().isoformat(),'in_air':True},
         'packet':{'samples':[{'armed':True}]},'missions':{'mission':{'state':'running'}}}
  gateway.runtime=lambda config=None:state
  try:gateway.create(scope,{**body,'request_id':str(uuid4())})
  except RuntimeError:pass
  else:raise AssertionError('Airborne lease was replaced')
  state['state']['in_air']=False;state['packet']['samples'][-1]['armed']=False
  state['missions']['mission']['state']='completed'
  gateway.create(scope,{**body,'request_id':str(uuid4())})
  assert (Path(old['directory'])/'stop.json').is_file()
  assert thread.call_args.kwargs['args'][2] is old
  assert gateway.session['id']!=old['id']
 print('5 lifecycle checks passed: immediate creation, idempotent retry, startup/airborne protection, grounded replacement.')
