"""One isolated service for a work session; leases reuse installed binaries without sudo."""
import datetime as dt
import json
from pathlib import Path
import subprocess
import sys
import time

def runnable_session(config,directory,now=None):
    """An existing worker record is evidence, never an instruction to replay its lease."""
    now=now or dt.datetime.now(dt.timezone.utc)
    expires=dt.datetime.fromisoformat(config['expires_at'])
    return expires>now and not (directory/'stop.json').exists() and not (directory/'state.json').exists()

def serve(work):
    work=Path(work).resolve();seen=set()
    while True:
        heartbeat=work/"gateway-heartbeat.json"
        try:
            age=time.time()-heartbeat.stat().st_mtime
        except OSError:return
        if age>15 or (work/"gateway-shutdown.json").exists():return
        current=work/"current-session.json"
        if not current.exists():time.sleep(.5);continue
        data=json.loads(current.read_text());sid=data.get("session_id")
        from uuid import UUID
        if str(UUID(sid))!=sid:raise ValueError("Invalid runtime lease")
        if sid in seen:time.sleep(.5);continue
        directory=(work/("session-"+sid)).resolve()
        if directory.parent!=work or directory.is_symlink():raise ValueError("Invalid session directory")
        config=json.loads((directory/"session.json").read_text())
        if config.get("session_id")!=sid:raise ValueError("Session identity mismatch")
        seen.add(sid)
        if not runnable_session(config,directory):continue
        child=subprocess.Popen([sys.executable,str(work/"runtime_worker.py"),str(directory)])
        try:
            while child.poll() is None:
                if (work/"gateway-shutdown.json").exists() or time.time()-heartbeat.stat().st_mtime>15:
                    stop=directory/"stop.json";stop.write_text(json.dumps({"reason":"Gateway disconnected"}))
                    try:child.wait(timeout=35)
                    except subprocess.TimeoutExpired:child.terminate()
                    return
                time.sleep(.5)
        finally:
            if child.poll() is None:child.terminate()
            child.wait(timeout=10)

if __name__=="__main__":serve(sys.argv[1])
