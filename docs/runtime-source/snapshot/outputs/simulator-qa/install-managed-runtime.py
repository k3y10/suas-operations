"""Manage the existing local simulator; no install, build, cloud service or public ports."""
import argparse
import os
from pathlib import Path
import pwd
import shutil
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--qa', action='store_true')
args = parser.parse_args()
assert os.getuid() == 0, 'Service configuration requires the existing local administrator'
operator = pwd.getpwnam('k3y10')
work = Path('/var/tmp/terrasatch-native-qa-1000')
source = Path(__file__).resolve().parent
assert work.is_dir() and work.stat().st_uid == operator.pw_uid
assert (work/'venv/bin/python').is_file()
for name in ('runtime_worker.py','runtime_supervisor.py','mission_adapter.py','terrain_mesh.py','coverage_model.py','probe.py'):
    shutil.copyfile(source/name, work/name)
    os.chown(work/name, operator.pw_uid, operator.pw_gid)

runtime = f'''# TerraSatch existing simulator management
[Unit]
Description=TerraSatch isolated PX4 runtime
After=terrasatch-simulator-gateway.service
PartOf=terrasatch-simulator-gateway.service
StartLimitIntervalSec=0
[Service]
User=k3y10
Group=k3y10
ExecStart={work}/venv/bin/python {work}/runtime_supervisor.py {work}
Environment=HOME={work}/home
Environment=PATH={work}/home/.local/bin:/usr/local/bin:/usr/bin:/bin
Restart=always
RestartSec=3
PrivateNetwork=yes
PrivateDevices=yes
DevicePolicy=closed
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths={work}
TemporaryFileSystem=/tmp:rw,size=512M,mode=1777
CPUQuota=200%
MemoryMax=3G
MemorySwapMax=0
TasksMax=256
TimeoutStopSec=40
KillMode=control-group
UMask=0077
'''
qa = ' --qa --latitude 40.5884 --longitude -111.6384' if args.qa else ''
gateway = f'''# TerraSatch existing simulator management
[Unit]
Description=TerraSatch private simulator gateway
Wants=terrasatch-simulator-runtime.service
After=network.target
StartLimitIntervalSec=0
[Service]
Type=simple
User=k3y10
Group=k3y10
ExecStartPre=/usr/bin/rm -f {work}/current-session.json
ExecStart={work}/venv/bin/python {source}/runtime_gateway.py --managed-unit{qa}
Environment=PYTHONUNBUFFERED=1
Restart={'no' if args.qa else 'on-failure'}
RestartSec=5
NoNewPrivileges=yes
PrivateDevices=yes
ProtectSystem=strict
ReadWritePaths={work} {source} {source.parent.parent}/work/runtime-bridge
MemoryMax=512M
CPUQuota=100%
TasksMax=64
TimeoutStopSec=45
KillMode=control-group
UMask=0077
[Install]
WantedBy=multi-user.target
'''
for name, content in [('runtime',runtime),('gateway',gateway)]:
    path = Path('/etc/systemd/system')/('terrasatch-simulator-'+name+'.service')
    if path.exists() and not path.read_text().startswith('# TerraSatch existing simulator management'):
        raise RuntimeError('Unrecognized existing service preserved: '+str(path))
    path.write_text(content)
subprocess.run(['systemctl','daemon-reload'],check=True)
subprocess.run(['systemctl','disable' if args.qa else 'enable','terrasatch-simulator-gateway.service'],check=True)
subprocess.run(['systemctl','restart','terrasatch-simulator-gateway.service'],check=True)
print('Existing simulator gateway and isolated runtime managed by systemd. QA mode: '+str(args.qa))
