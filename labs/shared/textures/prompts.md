# Texture generation prompts

Prompts for generating stylized replacement/expansion textures for the toon
shader kit. All lighting comes from the shaders, so the images must be flat
albedo — any baked lighting or shadows will fight the toon ramp.

**Global requirements (append to every prompt if your generator supports it):**

> seamless tileable texture, flat cel-shaded color blocks, hand-painted
> modern cel-shaded anime style, bold simple shapes, no photorealism, no
> baked lighting, no shadows, no ambient occlusion, no specular highlights,
> uniform flat illumination, game-ready albedo map

**Format:** bark 1024×2048 (vertical, grain running up), ground/rock
1024×1024, leaf sprites 512×512 on transparent background. Save as JPG
(opaque) / PNG (alpha) into `labs/shared/textures/`. The Tree Lab's
bark presets are wired in `labs/tree-lab/engine/barkTextures.js` — replace a
painted preset by giving it a `src` URL instead of a `paint` function.

---

## Bark textures (Tree Lab "Bark texture" presets)

### Classic (warm generic bark — replaces `tree-trunk-texture.jpg`)
> Stylized hand-painted generic tree bark texture, warm tan and light brown
> palette, soft vertical ridges and shallow furrows, gentle irregular grain,
> seamless tileable, vertical orientation, modern cel-shaded anime style, flat
> cel-shaded color blocks, no baked lighting or shadows, game-ready albedo
> map, 1024x2048

### Birch (white bark)
> Stylized hand-painted white birch tree bark texture, papery near-white
> cream base, distinctive short horizontal dark charcoal lenticel dashes,
> a few large dark gray peeling patches where branches shed, subtle warm
> gray vertical shading bands, seamless tileable, vertical orientation,
> modern cel-shaded anime style, flat cel-shaded color blocks, no baked
> lighting or shadows, game-ready albedo map, 1024x2048

### Beech (smooth silver-gray)
> Stylized hand-painted smooth beech tree bark texture, silver-gray base,
> soft mottled lighter and darker elliptical patches, completely smooth with
> no fissures or ridges, faint horizontal banding, seamless tileable,
> vertical orientation, modern cel-shaded anime style, flat cel-shaded color
> blocks, no baked lighting or shadows, game-ready albedo map, 1024x2048

### Oak (deep-fissured brown)
> Stylized hand-painted mature oak tree bark texture, medium warm brown
> base, deep dark vertical fissures winding slightly as they run upward,
> raised lighter tan ridge plates between the fissures, rugged and blocky,
> seamless tileable, vertical orientation, modern cel-shaded anime style, flat
> cel-shaded color blocks, no baked lighting or shadows, game-ready albedo
> map, 1024x2048

### Pine (red-brown jigsaw plates)
> Stylized hand-painted red pine tree bark texture, warm reddish-brown and
> orange-brown flaky jigsaw-puzzle plates of varying size, thin dark
> chocolate gaps between plates, papery layered look, seamless tileable,
> vertical orientation, modern cel-shaded anime style, flat cel-shaded color
> blocks, no baked lighting or shadows, game-ready albedo map, 1024x2048

### Ash (diamond-ridged gray)
> Stylized hand-painted ash tree bark texture, muted warm gray base,
> tight interlacing diamond-lattice ridge pattern, shallow crisscrossing
> furrows forming regular diamonds, subtle lighter highlights on ridge
> tops, seamless tileable, vertical orientation, modern cel-shaded anime
> style, flat cel-shaded color blocks, no baked lighting or shadows,
> game-ready albedo map, 1024x2048

### Craggy (rocky ancient bark — replaces `rock-texture.jpg` as bark)
> Stylized hand-painted ancient gnarled tree bark texture, deeply cracked
> rocky surface like weathered stone, dark gray-brown base with big
> irregular angular plates and wide dark crevices, heavy and monumental,
> seamless tileable, vertical orientation, modern cel-shaded anime style,
> flat cel-shaded color blocks, no baked lighting or shadows, game-ready
> albedo map, 1024x2048

---

## Optional extras (mentioned alongside the bark set)

### Leaf sprite sheet (crown card variations)
> Stylized hand-painted leaf cluster sprite, single clump of overlapping
> simple leaf silhouettes, solid flat mid-green fill with one darker green
> interior tone, crisp cutout edges, centered on fully transparent
> background, modern cel-shaded anime style, flat cel-shaded, no lighting or
> shadows, no gradients, game-ready alpha-cutout sprite, 512x512 PNG

(Variants: swap "simple leaf" for "maple leaf", "gingko fan leaf",
"needle cluster", "cherry blossom petal cluster in soft pink".)

### Grass ground (replaces `grassy-land-texture.jpg`)
> Stylized hand-painted grassy meadow ground texture seen from above,
> fresh saturated green base with slightly darker green patches and a few
> tiny lighter blade tufts, soft organic shapes, seamless tileable, anime
> modern cel-shaded anime style, flat cel-shaded color blocks, no baked lighting or
> shadows, game-ready albedo map, 1024x1024

### Rock / cliff (replaces `rock-texture.jpg` for rockgen)
> Stylized hand-painted rock cliff texture, cool gray stone with subtle
> blue undertone, large flat angular facets separated by thin darker
> cracks, minimal detail, seamless tileable, modern cel-shaded anime style,
> flat cel-shaded color blocks, no baked lighting or shadows, game-ready
> albedo map, 1024x1024
