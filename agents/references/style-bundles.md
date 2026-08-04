# Style Bundles and Shader Routing

A style bundle selects coordinated visual treatments. It never selects model
identity, species, geometry, scatter, current weather, or current time.

Use `CALL_ME_SENSEI_STYLE_BUNDLE` as the first-party anime-game reference.
Use `auditStyleBundleApplication()` before `applyStyleBundle()`. Production
targets need a stable `id`, an explicit `domain`, and an explicit `apply`
callback or adapter. Do not classify from object names, texture colors, or
scene parenting.

| Target domain | Bundle slot |
| --- | --- |
| `character`, `equipment`, `prop` | `toon` |
| `manufactured.environment` | `environment` |
| `vegetation.tree` | `treeShader` |
| `vegetation.grass` | `grassShader` |
| `vegetation.flower` | `flowerShader` |
| `terrain.ground` | `groundShader` |
| `natural.rock` | `rock` |
| `natural.debris` | `debris` |
| `water` | `water` |
| `sky` | `sky` |
| `cloud` | `cloud` |
| `weather` | `weather` |
| `post` | `post` |

Strict application preflights every target before the first mutation. Missing
slots, unknown domains, mixed material roles without an ID mask, unsupported
renderers, and undocumented custom adapters are failures. Advisory mode may
apply valid targets, but it must return every skipped target and gap.

Style bundle v2 is visual-only and includes anime art-direction metadata.
Parsing a v1 document returns migration warnings for old asset selections;
move those decisions to scene configuration or an asset-sourcing policy.
