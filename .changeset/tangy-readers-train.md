---
'@qwik.dev/core': patch
'@qwik.dev/router': patch
---

fix(core): hoist the `__brand`/`__brand__` escape hatch in `verifySerializable` above the type switch so it applies to functions too. Route loader and action refs are functions stamped with `__brand` (`'server_loader'` / `'server_action'`); they were tripping the dev verifier whenever passed as `component$` props (e.g. via `QwikRouterMockProvider.loaders`).

fix(router): `QwikRouterMockProvider`'s `loaders` mock now wraps each entry's data in an `AsyncSignal` via `createLoaderSignal`, mirroring `useQwikRouter`. Previously raw data was stored directly under the loader id, so `useFooLoader().value` resolved to `undefined` (the v2 loader contract reads `state[id].value`, while the v1 mock relied on the v1 `_wrapProp` semantics).
