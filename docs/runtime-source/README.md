# Tested native runtime source backup — October 27, 2026

This is a source-only backup of the existing demo runtime and its regression checks. It preserves the completed-mission recording and stale-lease startup guards that were validated on October 27. The original relative workspace paths are retained under `snapshot/` so the regression scripts can import their source modules.

The running services still use their existing installed paths. Do not run the installer or gateway from this backup during demo preparation; their working directories and private bridge paths are environment-specific. Use the [operator guide](../DEMO-2026-10-28.md) for normal startup.

`manifest.json` records file hashes and the validated native profile hash. It includes the seven profile-hashed modules, their two support modules, existing startup/installation helpers, and the lifecycle/recording regression scripts. No credentials, gateway tokens, `.env` files, telemetry, private keys, compiled PX4 binaries or third-party source trees are included.

The snapshot itself can be checked without launching a simulator:

```bash
python3 snapshot/work/scripts/test_runtime_recording.py
python3 snapshot/work/scripts/test_gateway_lifecycle.py
```

The live profile passed a genuine simulated mission plus an airborne revision at `2026-10-27T19:50:12.783585Z`. A subsequent authorized production radio mission completed with retained telemetry and coverage, which remained unchanged and readable after a grounded service restart.
