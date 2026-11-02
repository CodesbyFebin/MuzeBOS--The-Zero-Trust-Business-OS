# Arena 3D agents — 2026-10-29

The default office now uses Three.js and original procedural robot models. No external model files, commercial tilesets, remote textures or artwork from upstream projects are included. Three.js is MIT licensed; its license remains in the dependency distribution. The Pixi.js office is retained as an explicitly selectable fallback.

## Interaction

Open `/workspace/brain/arena` after workspace sign-in. Each robot represents a recorded task assignment, with at most four per station and 24 in total. Empty records produce an empty office. Drag to orbit, pinch/scroll to zoom, or use the camera buttons. Click a robot to open the same payload-hash, worker and lease details as the accessible HTML task list. Selected robots have a floor ring. The task list remains usable without either graphics renderer.

Amber denotes the Jev approval station; green denotes a task with a valid lease in the latest snapshot. Other assignments use the accent color. Failed/expired tasks move to the Healing Chamber, which does not imply an automatic repair service. Leases and movements remain snapshot observations, refreshed every 15 seconds, rather than live process telemetry. 3D does not implement the 2D delegation-envelope effect; parent-child evidence remains in stored tasks and action evidence.

## Performance and failure behavior

The Three.js renderer and controls load only for the selected 3D view. Pixi loads only when the 2D view is selected. Geometry is shared, actor materials are released when assignments leave, pixel ratio is capped at 1.5, frames are capped around 30 FPS, and rendering pauses when the document or floor is hidden. Static scenes render on changes. Reduced motion disables movement interpolation, walking and lease bobbing. Container resizing adjusts the camera for narrow screens.

Switching views, signing out or leaving the page disconnects observers, removes handlers, cancels animation and disposes controls, geometries, materials, textures and the renderer context. WebGL initialization/context failure offers the 2D fallback; existing business records remain available. This is a visualization enhancement only: no worker, model call, computer sandbox or approval privilege is introduced.

## Verification

See the 3D follow-up section in `VERIFICATION.md`. `tests/metabos-arena-layout.test.ts` checks empty/unsupported data, bounded assignments, identity preservation and station changes. `scripts/verify-arena-browser.mjs` exercises real persisted drafts, Three.js rendering, robot raycast selection, camera controls, 2D switching, context loss fallback, mobile sizing and sign-out. Worker output in that script remains explicitly scripted QA data, not model generated.
