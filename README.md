# TerraSatch sUAS Operations

AvyTS and PyroTS share one satellite map, Satchy Assistant, structured mission drafts, and the existing TerraSatch workspace API.

- AvyTS: UGRC UAC region geometry and dated Avalanche.org forecast products; official danger stays separate from terrain and scan coverage.
- PyroTS: WFIGS incidents/current/historical perimeters, MTBS mapped burns, available BAER soil burn severity, NOAA MRMS 24-hour precipitation estimates, and dated NWS wind.
- H3 cell selection determines ordered waypoints and coverage geometry. AGL in a local draft is an intent, not an autopilot altitude.
- Existing server-side plan approval and simulation-only asset restrictions remain required. Exact selected-cell dispatch requires the optional API capability `simulation:selected_cells:v1`; older services are rejected rather than substituted.
- QuakSatch's existing canonical encoder computes a local record digest. A reachable service does not verify a proof; registration remains explicitly unconfigured.
- No real aircraft execution or sensor capture is claimed.

## Run

```sh
npm ci
npm run dev
npm test
npm run build
```

The existing isolated PX4 runtime is separate from Vercel. Restarting a cached runtime does not rebuild PX4. The development-only native reader is loopback-only and absent from production.

Deploy using the existing `terrasatch-sim` Vercel project and `suas.terrasatch.com`. No GitHub Actions are required. The public data handlers accept bounded read requests; workspace operations use the fixed canonical API origin, existing sessions, CSRF, and permissions.

Missing, stale or unavailable source data stays labeled. Burn perimeters do not establish severity; terrain arrows are downhill orientation, not a runoff forecast. Forecast wind animation is labeled separately from station observations.
