# TerraSatch sUAS Operations

AvyTS and PyroTS share one satellite map, Satchy Assistant, structured mission drafts, and the existing TerraSatch workspace API.

- AvyTS: UGRC UAC region geometry and dated Avalanche.org forecast products; official danger stays separate from terrain and scan coverage.
- PyroTS: WFIGS incidents/current/historical perimeters, MTBS mapped burns, available BAER soil burn severity, NOAA MRMS 24-hour precipitation estimates, and dated NWS wind.
- H3 cell selection determines ordered waypoints and coverage geometry. AGL in a local draft is an intent, not an autopilot altitude.
- Existing server-side plan approval and simulation-only asset restrictions remain required. Exact selected-cell dispatch requires the optional API capability `simulation:selected_cells:v1`; older services are rejected rather than substituted.
- Executable missions use the existing server-side QuakSatch integration. Show verification only when that exact mission hash has a registered, verified proof. Local planning drafts can still show an unregistered digest.
- No real aircraft execution or sensor capture is claimed.

## October 28 demonstration

Production: **https://suas.terrasatch.com/**. Use the existing TerraSatch account at the branded sign-in screen.

**Receive report → click report → confirm one H3 cell → review and approve Quick Survey → Recon Results.**

Read the [demo startup and recovery guide](docs/DEMO-2026-10-28.md) before the event. It includes the verified receiver/site identity, exact radio command, managed service commands, and the two short demonstration messages.

The tested frontend release is `ff432e0491f2313fef1e7d75f2b6370fe4995cff`. The deployed API release is `e0d241a6cf1e6acd02c81a17637b4631165c27b2` on the existing `codex/uas-simulation-staging` branch of `k3y10/terrasatch-api-v1`. The October 27 native runtime source and recording/startup fixes are preserved in the [source snapshot](docs/runtime-source/README.md).

On the configured demo PC, Ubuntu starts the existing radio and simulator services. The existing Windows scheduled task maintains the private simulator bridge. Attach the receiver to WSL and confirm the services and the app's **Simulator: Ready** status. A second foreground receiver is unnecessary while the managed listener is running.

October 27 verification: 53 frontend tests passed; genuine radio/AvyTS and verified-phone/PyroTS missions completed. The final radio survey flew for 102.9 seconds and landed 171.0 seconds after cell confirmation. Its 100% **modelled** footprint coverage and exact mission recording were reopened through the authenticated app after a grounded service restart. No new sensor measurement was obtained.

Keep the tested production release for the event. Preparing and approving a new mission uses the installed PX4 build; it does not require a rebuild or a new deployment.

## Frontend development

```sh
npm ci
npm run dev
npm test
npm run build
```

The existing isolated PX4 runtime is separate from Vercel. Restarting a cached runtime does not rebuild PX4. The development-only native reader is loopback-only and absent from production.

Deploy using the existing `terrasatch-sim` Vercel project and `suas.terrasatch.com`. No GitHub Actions are required. The public data handlers accept bounded read requests; workspace operations use the fixed canonical API origin, existing sessions, CSRF, and permissions.

Missing, stale or unavailable source data stays labeled. Burn perimeters do not establish severity; terrain arrows are downhill orientation, not a runoff forecast. Forecast wind animation is labeled separately from station observations.
