// OSS documentation pages. Everything documented here works offline with the
// open-source package; hosted-only features are explicitly badged "Pro" and
// link to toonlab.io. The settings reference renders the generated
// settings-reference.md from this folder.
import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { marked } from 'marked';
import {
  BookOpenText,
  Bot,
  Check,
  Copy,
  Crown,
  Lightbulb,
  Plug,
  Sparkles,
  TerminalSquare,
} from 'lucide-react';
import settingsReferenceRaw from './settings-reference.md?raw';
import './docs.css';

const GITHUB = 'https://github.com/call-me-sensei/toonlab';

function CopyButton({ value }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="docs-codeblock-copy"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function CodeBlock({ code, label }) {
  return (
    <div className="docs-codeblock">
      {label && <div className="docs-codeblock-label">{label}</div>}
      <pre><code>{code}</code></pre>
      <CopyButton value={code} />
    </div>
  );
}

function PromptBlock({ title, prompt, note, pro }) {
  return (
    <div className="docs-promptblock">
      <span className="docs-promptblock-title">
        {title}
        {pro && <span className="docs-pro">Pro</span>}
      </span>
      <CodeBlock code={prompt} />
      {note && <p className="docs-promptblock-note">{note}</p>}
    </div>
  );
}

function ProBadge() {
  return <span className="docs-pro">Pro</span>;
}

/* ---------------------------------------------------------------- overview */

function Overview() {
  return (
    <article>
      <div className="docs-eyebrow">Documentation</div>
      <h1>Build games with ToonLab and your AI coding agent</h1>
      <p className="docs-lede">
        ToonLab is an open-source anime-style runtime for Three.js plus browser labs for authoring
        shaders, assets, and world systems. Everything on this page runs from this repo or the npm
        package — no account, no service. The optimal workflow adds an AI coding agent driving it
        all through skills and MCP.
      </p>

      <h2>The pieces</h2>
      <ul>
        <li>
          <strong>The runtime library</strong> —{' '}
          <a href="https://www.npmjs.com/package/@call-me-sensei/toonlab" target="_blank" rel="noreferrer">
            <code>@call-me-sensei/toonlab</code>
          </a>
          : toon and environment shading, water, sky, weather, vegetation, lighting, post, camera,
          game feel, and seeded generators for rocks, props, buildings, paths, and villages.
          MIT-licensed, WebGPU-first with a WebGL2 fallback, zero bundled textures.
        </li>
        <li>
          <strong>The labs</strong> — visual editors served by <code>npm run dev</code> (or hosted
          at <a href="https://toonlab.io" target="_blank" rel="noreferrer">toonlab.io</a>). Every
          lab exports a portable preset document the runtime loads.
        </li>
        <li>
          <strong>The local MCP server</strong> — bundled with the package: your coding agent
          searches the procedural catalog and public CC0 sources, reads and saves presets, and
          imports assets into an on-disk <code>.toonlab/</code> workspace. Stdio, no OAuth.
        </li>
        <li>
          <strong>Hosted generation and library</strong> <ProBadge /> — toonlab.io adds a remote
          MCP server with AI generation (concept art, seamless textures, image→3D), stored
          characters, a cloud library, and the public gallery.
        </li>
      </ul>

      <h2>The optimal workflow</h2>
      <p>
        <span className="docs-step-label">01</span>
        <strong>Install the runtime and the agent skills.</strong> <code>npm install
        @call-me-sensei/toonlab</code>, then copy the feature skills from{' '}
        <a href={`${GITHUB}/tree/main/agents`} target="_blank" rel="noreferrer"><code>agents/</code></a>{' '}
        into your project — they teach the agent the assembly order, the frame-loop contract, and
        each subsystem&apos;s API. Start with <code>game-dev</code>.
      </p>
      <p>
        <span className="docs-step-label">02</span>
        <strong>Connect the local MCP server.</strong> See <a href="#/mcp">Connect via MCP</a> —
        one JSON block, no account. Your agent can now find or import assets and share presets
        with the labs through <code>.toonlab/</code>.
      </p>
      <p>
        <span className="docs-step-label">03</span>
        <strong>Author looks visually, apply them from code.</strong> Tune shaders and world
        systems in the labs, export presets, and load them in your game — or fetch a published{' '}
        <a href="https://toonlab.io/styles" target="_blank" rel="noreferrer">style bundle</a> with{' '}
        <code>fetchStyleBundle</code>.
      </p>
      <p>
        <span className="docs-step-label">04</span>
        <strong>Prompt, run, iterate.</strong> Start from a goal prompt with a verifiable outcome
        and let the agent check its own work — the <a href="#/prompts">prompt cookbook</a> has
        ready-to-paste recipes.
      </p>

      <h2>Start here</h2>
      <div className="docs-cards">
        <a className="docs-card" href="#/library">
          <BookOpenText size={18} aria-hidden />
          <strong>Using the library</strong>
          <span>Bootstrap a world, customize shaders, author assets, share your work.</span>
        </a>
        <a className="docs-card" href="#/mcp">
          <Plug size={18} aria-hidden />
          <strong>Connect via MCP</strong>
          <span>The local server, its tool reference, and the optional Pro remote server.</span>
        </a>
        <a className="docs-card" href="#/prompts">
          <Sparkles size={18} aria-hidden />
          <strong>Prompt cookbook</strong>
          <span>The first prompt to start a game, and recipes for the common jobs.</span>
        </a>
        <a className="docs-card" href="#/reference">
          <TerminalSquare size={18} aria-hidden />
          <strong>Settings reference</strong>
          <span>Every tunable field with types, defaults, and ranges — generated from the schemas.</span>
        </a>
      </div>
    </article>
  );
}

/* ----------------------------------------------------------------- library */

const WORLD_SNIPPET = `import * as THREE from 'three';
import { createStylizedTerrain, createStylizedWorld } from '@call-me-sensei/toonlab';

// Seeded terrain — any seed is a valid, playable world.
const terrain = createStylizedTerrain({ seed: 42, size: 1000, archetype: 'terracedKarst' });
const terrainRoot = new THREE.Group();
terrainRoot.add(terrain.root);
scene.add(terrainRoot);

// Environment shading, sun + shadows, sky, water, LOD forests, grass,
// fog, and collision — all on by default.
const world = await createStylizedWorld({
  renderer, scene, camera,
  terrain: { heightAt: terrain.heightAt, root: terrainRoot, size: terrain.meshExtent },
  water: { level: terrain.waterLevel },
  weather: { preset: 'call_me_sensei' },
  followTarget: character, // optional: splashes, wakes, grass push
});
character.position.copy(terrain.spawn);

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  world.update(clock.getDelta());
  renderer.render(scene, camera);
});`;

const TOON_SNIPPET = `import { applyToonShader, createToonSettings } from '@call-me-sensei/toonlab/toon';

// Every field ships a sensible default; override only what defines your look.
// 23 groups, 298 fields — see the Settings reference for all of them.
const settings = createToonSettings({
  preset: 'default',
  rimLight: { intensity: 0.35, mode: 'depth' },
  outline: { thickness: 1.6 },
  skinTone: { skinShadowBrightness: 0.94 },
});

applyToonShader(characterRoot, { settings });`;

const ASSET_SNIPPET = `import { createCatalog } from '@call-me-sensei/toonlab/catalog';
import { propAssetFromObject } from '@call-me-sensei/toonlab/propgen';

// Procedural catalog: every recipe/preset as a searchable manifest.
const catalog = createCatalog();
const lantern = catalog.spawn('prop/lantern/stone-toro', { seed: 7 }); // grounded, collided, LOD'd

// Any imported GLB (e.g. a CC0 model imported through the local MCP server)
// joins the same placement pipeline:
const shrine = propAssetFromObject(importedGltf.scene);`;

const TEXGEN_SNIPPET = `import {
  createTextureSettings, evaluateTextureMaps,
  findTexturePreset, syncTextureMapTextures,
} from '@call-me-sensei/toonlab/texgen';

// 25 tileable generators, layered overlays (moss, rust, grime), a
// cel-capable color ramp, and derived normal/AO/roughness/ORM maps —
// all CPU-baked from a 60+ preset library. No texture assets shipped.
const settings = createTextureSettings(findTexturePreset('mossy-bricks').settings);
const maps = await evaluateTextureMaps(settings, { size: 1024 });
const textures = syncTextureMapTextures(maps); // THREE.DataTexture per map
material.map = textures.albedo;
material.normalMap = textures.normal;`;

const BUNDLE_SNIPPET = `import { fetchStyleBundle } from '@call-me-sensei/toonlab/styles';

// One published document that styles many systems at once. Fetching public
// bundles needs no account; authoring them happens on toonlab.io (Pro).
const { settings } = await fetchStyleBundle('sakura-dusk'); // slug or full URL

applyToonShader(characterRoot, { settings: settings.toon });
sky.applySettings(settings.sky);
water.applySettings(settings.water);
// Other slots: environment, weather, grass, flowers, vegetationShader,
// tree, lighting, post — apply each through its system's runtime.`;

function Library() {
  return (
    <article>
      <div className="docs-eyebrow">Runtime library</div>
      <h1>Using the npm package</h1>
      <p className="docs-lede">
        <code>@call-me-sensei/toonlab</code> is a runtime library — your app owns the renderer and
        the frame loop; ToonLab systems accept your objects. It is WebGPU-first (TSL /
        NodeMaterial) with a WebGL2 fallback through the same path.
      </p>

      <CodeBlock label="Install" code={'npm install @call-me-sensei/toonlab'} />

      <div className="docs-callout">
        <Bot size={16} aria-hidden />
        <span>
          For every tunable field with types, defaults, and ranges, see the{' '}
          <a href="#/reference">Settings reference</a> — generated from the same schemas that
          drive the labs and the debug panel.
        </span>
      </div>

      <h2>A complete open world</h2>
      <p>
        <code>createStylizedWorld</code> composes environment shading, an aligned sun with real
        shadows, sky, water, LOD forests, follow-window grass, unified fog, weather, and collision
        in one call. Terrain is a pure contract — <code>heightAt(x, z)</code> in meters plus a
        displaced mesh — so you can use the seeded generator or bring your own.
      </p>
      <CodeBlock label="main.js" code={WORLD_SNIPPET} />
      <p>
        Archetypes: <code>terracedKarst</code>, <code>lakeland</code>, <code>alpine</code>,{' '}
        <code>rollingPlains</code>, <code>archipelago</code>. Add solid props with{' '}
        <code>world.collision.addCircles(...)</code> and a clickable minimap with{' '}
        <code>createWorldMinimap</code>. The{' '}
        <a href="/examples/outdoor-world/" target="_blank" rel="noreferrer">outdoor-world example</a>{' '}
        is the reference project layout.
      </p>

      <h2>What each import gives you</h2>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead>
            <tr>
              <th>Import</th>
              <th>What you get</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>/toon</td><td>Anime character shader: cel bands, face lighting, rim, hair highlights, outlines — 23 preset-serializable settings groups.</td></tr>
            <tr><td>/environment</td><td>Scene shader for texture packs and glTF: material-role classification, wrapped lighting, time-of-day, fog, cloud shadows.</td></tr>
            <tr><td>/water</td><td>Gerstner-wave water with a calm→storm dial, breakers, foam, caustics, ripples, and a CPU spectrum mirror for buoyancy.</td></tr>
            <tr><td>/sky</td><td>Gradient/sun/painterly-cloud/star system — 46 portable art fields per preset.</td></tr>
            <tr><td>/weather</td><td>Cross-system coordinator: 22 presets, GPU precipitation, lightning; drives sky, water, wind, vegetation, and fog.</td></tr>
            <tr><td>/vegetation</td><td>Instanced grass and flower fields, procedural trees, palettes, masks, and scatter helpers.</td></tr>
            <tr><td>/lighting</td><td>Versioned light recipes, budgets, runtime realization, and a data-only UE5 handoff.</td></tr>
            <tr><td>/post, /camera, /game-feel</td><td>Compositor pipeline, camera operator stack + director, and hit-stop/punch/flash game feel.</td></tr>
            <tr><td>/texgen</td><td>Seamless CPU-baked PBR texture generator with 60+ presets and a natural-language recipe mapper.</td></tr>
            <tr><td>/rockgen, /propgen, /buildinggen, /pathgen, /villagegen</td><td>Seeded generators for rocks, 12 prop families, building exteriors, road networks, and settlements.</td></tr>
            <tr><td>/vfxgen, /ambientfx, /fauna</td><td>Gameplay VFX (trails, impacts, weapons), ambient particles (petals, fireflies), and GPU-animated creatures.</td></tr>
            <tr><td>/catalog, /loaders, /debug</td><td>Searchable asset manifest with <code>catalog.spawn</code>, model loaders (GLB/VRM/PMX/FBX), and the schema-driven tuning panel.</td></tr>
          </tbody>
        </table>
      </div>
      <p>
        The full cluster table with per-system deep dives is in the{' '}
        <a href={`${GITHUB}#whats-inside`} target="_blank" rel="noreferrer">README</a> and{' '}
        <a href={`${GITHUB}/tree/main/docs`} target="_blank" rel="noreferrer"><code>docs/</code></a>.
      </p>

      <h2>Customize a shader</h2>
      <p>
        Every ToonLab shader is driven by a settings object created from a schema — you never
        write GLSL/TSL to get a custom look. The same schemas power the labs, so anything you can
        click there is a field you can set in code.
      </p>
      <CodeBlock label="Custom character shader" code={TOON_SNIPPET} />
      <p>
        The intended workflow for a signature look: tune it visually in the{' '}
        <a href="/shader-lab/" target="_blank" rel="noreferrer">Character Shader Lab</a>, export
        the preset document, and load it in your game (<code>serializeToonPreset</code> /{' '}
        <code>registerToonPreset</code>). For looks beyond the schema, the shaders are open-source
        TSL modules — fork the cluster and keep the preset contract.
      </p>

      <h2>Create assets</h2>
      <p>
        Assets come from seeded procedural generators, the texture generator, and anything you
        import — including CC0 assets your agent pulls in through the{' '}
        <a href="#/mcp">local MCP server</a>. All of them end up in the same placement pipeline:
        grounded, collided, instanced, with true-3D-distance LODs.
      </p>
      <CodeBlock label="Procedural + imported assets" code={ASSET_SNIPPET} />
      <CodeBlock label="Procedural textures" code={TEXGEN_SNIPPET} />

      <h2>Apply a style bundle</h2>
      <CodeBlock label="Style bundle in the runtime" code={BUNDLE_SNIPPET} />
      <p>
        Bundles resolve through <code>GET https://toonlab.io/api/v1/bundles/:slug</code> — public,
        no API key. Pass a full URL to use a self-hosted bundle document instead. Authoring and
        publishing bundles happens in the{' '}
        <a href="https://toonlab.io/styles" target="_blank" rel="noreferrer">bundle builder</a>{' '}
        <ProBadge />.
      </p>

      <h2>Share your work</h2>
      <p>
        Locally, everything you author lives in portable JSON documents: labs save into the
        disk-backed <code>.toonlab/</code> workspace (shared with the MCP server), and every lab
        can export preset files you can commit to your repo or hand to anyone.
      </p>
      <p>
        Publishing to the public <a href="https://toonlab.io/gallery" target="_blank" rel="noreferrer">gallery</a>{' '}
        <ProBadge /> works through a toonlab.io account: save a creation to your cloud library,
        set its visibility to public, and it gets a permanent page and appears in gallery search —
        loadable by anyone, including by reference from style bundles.
      </p>
    </article>
  );
}

/* --------------------------------------------------------------------- mcp */

const LOCAL_CONFIG = `{
  "mcpServers": {
    "toonlab-local": {
      "command": "npx",
      "args": ["-y", "@call-me-sensei/toonlab@latest", "--workspace", "/absolute/path/to/your-game/.toonlab"]
    }
  }
}`;

const LOCAL_TOOLS = [
  ['get_workspace_info', 'Workspace path, migration status, and item counts.'],
  ['search_assets', 'Search built-in procedural assets, saved library entries, lab presets, and files on disk.'],
  ['get_asset', 'Complete asset, recipe, preset, library entry, or workspace file descriptor by id.'],
  ['list_my_creations', 'List the disk-backed library, saved lab documents, presets, imports, and exports.'],
  ['get_my_creation', 'Read a saved creation or small workspace file (binary as base64 with a direct path).'],
  ['save_creation', 'Save a JSON or text creation into .toonlab/creations so labs and agents share it.'],
  ['generate_asset', 'Generate a deterministic, editable asset recipe from a built-in catalog entry (seeded — no credits, no AI).'],
  ['search_cc0_assets', 'Search CC0 models, textures, and HDRIs from Poly Haven and ambientCG.'],
  ['get_cc0_asset', 'Source, attribution, and download metadata for one CC0 asset.'],
  ['import_cc0_asset', 'Download a CC0 asset plus attribution manifest into .toonlab/imports.'],
  ['get_generation_capabilities', 'Explains what generation the local server offers (procedural recipes only).'],
  ['list_style_labs', 'List the style-domain recipe systems the workspace understands.'],
  ['create_style_recipe', 'Author a style-domain recipe document (post, camera, game feel, …).'],
  ['generate_style_presets', 'Generate seeded preset variations for a style domain.'],
  ['validate_style_document', 'Validate a style recipe/preset document against its schema.'],
];

function Mcp() {
  return (
    <article>
      <div className="docs-eyebrow">Model Context Protocol</div>
      <h1>Connect your AI coding agent</h1>
      <p className="docs-lede">
        The open-source package bundles a local MCP server: stdio transport, no account, no OAuth,
        everything on disk. It shares the <code>.toonlab/</code> workspace with the browser labs,
        so what your agent saves, the labs see — and vice versa.
      </p>

      <h2>Setup</h2>
      <p>
        With the labs running (<code>npm run dev</code>), open{' '}
        <a href="/settings/" target="_blank" rel="noreferrer">/settings/</a> for a ready-made,
        checkout-specific config to paste into your client. Or configure it directly from npm:
      </p>
      <CodeBlock label="MCP client config" code={LOCAL_CONFIG} />
      <p>
        The workspace directory is created on first use and is ignored by Git by default. See{' '}
        <a href={`${GITHUB}/blob/main/docs/mcp.md`} target="_blank" rel="noreferrer">
          Local MCP and workspace
        </a>{' '}
        for the full layout.
      </p>

      <h2>Tool reference (local server)</h2>
      <div className="docs-table-wrap">
        <table className="docs-table">
          <thead>
            <tr>
              <th>Tool</th>
              <th>What it does</th>
            </tr>
          </thead>
          <tbody>
            {LOCAL_TOOLS.map(([name, what]) => (
              <tr key={name}>
                <td>{name}</td>
                <td>{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Note the boundary: the local <code>generate_asset</code> produces <strong>seeded
        procedural recipes</strong> from the built-in catalog — deterministic and free. AI
        generation (diffusion images, textures, 3D models) is a hosted Pro feature.
      </p>

      <h2>
        The remote Pro server <ProBadge />
      </h2>
      <div className="docs-callout docs-callout--pro">
        <Crown size={16} aria-hidden />
        <span>
          <a href="https://toonlab.io" target="_blank" rel="noreferrer">toonlab.io</a> hosts a
          remote MCP server at <code>https://toonlab.io/mcp</code> (OAuth, Pro/Team plans) that
          adds an indexed CC0 search with styled previews, AI generation on credits — concept art,
          seamless textures, image→3D chaining — stored characters with reference-image
          consistency, and your cloud library. It composes with the local server; run both. Setup
          and its tool reference:{' '}
          <a href="https://toonlab.io/docs/mcp" target="_blank" rel="noreferrer">
            toonlab.io/docs/mcp
          </a>.
        </span>
      </div>
    </article>
  );
}

/* ----------------------------------------------------------------- prompts */

function Prompts() {
  return (
    <article>
      <div className="docs-eyebrow">Prompt cookbook</div>
      <h1>Prompts that build games</h1>
      <p className="docs-lede">
        These prompts assume the recommended setup — the runtime installed, the{' '}
        <a href={`${GITHUB}/tree/main/agents`} target="_blank" rel="noreferrer">ToonLab skills</a>{' '}
        copied into your project, and the <a href="#/mcp">local MCP server</a> connected. Recipes
        that need the hosted service are badged <span className="docs-pro">Pro</span>.
      </p>

      <div className="docs-callout">
        <Lightbulb size={16} aria-hidden />
        <span>
          Pattern: <strong>goal → constraints → definition of done.</strong> Let the agent choose
          APIs (that is what the skills are for), but always give it something observable to
          verify — &quot;until I can walk to the shoreline&quot; beats &quot;set up a world&quot;.
        </span>
      </div>

      <h2>Start a game</h2>
      <PromptBlock
        title="The first prompt"
        prompt={`Using the ToonLab game-dev skill, set up a new Three.js + Vite project with
@call-me-sensei/toonlab. Build a 1 km seeded open world (archetype "lakeland")
with the bundled toon-shaded mannequin as the playable character, water, sky,
the "call_me_sensei" weather preset, post-processing, and a follow camera with
game feel. Follow the skill's assembly order and frame-loop contract, then run
the dev server and fix issues until I can walk from spawn to the shoreline
and swim.`}
        note="The game-dev skill carries the assembly order and the frame-loop contract, so the agent wires update order and render ownership correctly on the first try."
      />

      <h2>Dress the world with assets</h2>
      <PromptBlock
        title="CC0 import via the local server"
        prompt={`Use the toonlab-local MCP server to furnish the fishing village: search
CC0 sources for lanterns, crates, barrels, and a pier (search_cc0_assets),
import the best fits with import_cc0_asset, and place them with the propgen
placement pipeline so they are grounded, collided, and LOD'd. Show me what
came from where with attribution.`}
        note="import_cc0_asset writes the files and an attribution manifest into .toonlab/imports for direct use by the project."
      />
      <PromptBlock
        title="Procedural set dressing"
        prompt={`Using the ToonLab outdoor-world and rockgen skills, scatter cliff rocks along
the north ridge and add a stepped stone path from the village to the shrine
with an arched plank bridge over the river. Keep everything walkable — the
path should flatten heightAt and register collision.`}
      />
      <PromptBlock
        title="Seeded recipes from the catalog"
        prompt={`With the toonlab-local MCP server, generate three lantern recipe variations
(generate_asset from the catalog entry, different seeds), save them as
creations, and spawn them along the pier so I can compare them in the game.`}
      />

      <h2>Textures and style</h2>
      <PromptBlock
        title="Procedural texture with texgen"
        prompt={`Using the ToonLab texture skill, build a mossy stone texture for the shrine
path with texgen (start from the mossy-bricks preset), tune the ramp toward a
hand-painted five-stop cel look, and derive normal + AO maps.`}
      />
      <PromptBlock
        title="AI-generated seamless texture"
        pro
        prompt={`Generate a 2k seamless mossy stone texture through the toonlab remote MCP
server (kind texture_image) and apply it to the shrine walls. Before
generating, call get_generation_capabilities and tell me the credit cost.`}
        note="AI generation runs on toonlab.io (Pro plan + credits). The local texgen recipe above is the free procedural alternative."
      />
      <PromptBlock
        title="Apply a style bundle"
        prompt={`Fetch the public "sakura-dusk" style bundle (fetchStyleBundle in
@call-me-sensei/toonlab/styles) and apply every filled slot — toon shading,
sky, water, environment, post — so the whole game matches it. Wire it behind
a setStyle() function so I can swap bundles later.`}
      />

      <h2>Atmosphere and feel</h2>
      <PromptBlock
        title="Weather as drama"
        prompt={`Using the ToonLab weather and lighting skills, add a day/night cycle and a
thunderstorm that rolls in at dusk: wind ramps in the grass and trees, rain
streaks and ripples the water, lightning drives the sky flash and the light
rig, and the storm clears to fireflies at night.`}
      />
      <PromptBlock
        title="Anime combat feedback"
        prompt={`Using the ToonLab game-feel and vfxgen skills, make the sword swing feel
anime: 60 ms hit-stop on contact, a camera punch, a trail ribbon that follows
the blade, impact sparks, and a one-frame white flash on the target. Keep it
all through the game-feel runtime so time scaling stays consistent.`}
      />

      <h2>
        Characters <ProBadge />
      </h2>
      <PromptBlock
        title="Consistent character art"
        pro
        prompt={`Using my stored ToonLab character Yuki (list_characters first to see her
options), generate a concept of her in the travel cloak, lantern in hand, on
the pier at dusk. Pass character: { ref: "Yuki", outfit: "travel cloak" } —
do not re-describe her appearance in the prompt.`}
        note="Stored character profiles with reference-image consistency live on toonlab.io — the server composes appearance, art style, and references automatically."
      />

      <h2>Ship the loop</h2>
      <PromptBlock
        title="Iterate with verification"
        prompt={`Play through the current build: spawn, walk to the village, buy the lantern,
sail past the reef in the storm. Fix anything that breaks the loop — falling
through terrain, unlit props at night, water clipping in the boat — and rerun
until the whole sequence works. List what you changed.`}
      />

      <p>
        The extended cookbook — including the full Pro generation and character workflows — is at{' '}
        <a href="https://toonlab.io/docs/prompts" target="_blank" rel="noreferrer">
          toonlab.io/docs/prompts
        </a>.
      </p>
    </article>
  );
}

/* --------------------------------------------------------------- reference */

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/&[a-z]+;|&#\d+;/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

let referenceHtmlCache = null;

function referenceHtml() {
  if (referenceHtmlCache) return referenceHtmlCache;
  let html = marked.parse(settingsReferenceRaw, { async: false });
  html = html.replace(
    /<h([123])>([^<]+)<\/h\1>/g,
    (_m, level, text) => `<h${level} id="${slugify(text)}">${text}</h${level}>`,
  );
  html = html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/, '');
  html = html.replace(
    /href="([\w-]+\.md)"/g,
    `href="${GITHUB}/blob/main/docs/$1" target="_blank" rel="noreferrer"`,
  );
  referenceHtmlCache = html;
  return html;
}

function Reference() {
  const html = useMemo(referenceHtml, []);
  return (
    <article>
      <div className="docs-eyebrow">Generated reference</div>
      <h1>Settings reference</h1>
      <p className="docs-lede">
        Every tunable field in <code>@call-me-sensei/toonlab</code>, generated straight from the
        settings schemas that drive the labs and the debug panel — with type, default, range or
        options, and whether the field is portable (saved in preset documents) or scene/runtime
        state.
      </p>
      <div className="docs-callout">
        <Bot size={16} aria-hidden />
        <span>
          <strong>Using a coding agent?</strong> Point it at the raw markdown source of this page:{' '}
          <code>docs/settings-reference.md</code> in the repo (regenerate with{' '}
          <code>node scripts/generate-settings-reference.mjs</code>), or fetch it from{' '}
          <a href="https://toonlab.io/docs/reference.md" target="_blank" rel="noreferrer">
            toonlab.io/docs/reference.md
          </a>.
        </span>
      </div>
      <div className="docs-md" dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}

/* --------------------------------------------------------------------- app */

const SECTIONS = [
  { hash: '', label: 'Overview', component: Overview },
  { hash: '#/library', label: 'Using the library', component: Library },
  { hash: '#/mcp', label: 'Connect via MCP', component: Mcp },
  { hash: '#/prompts', label: 'Prompt cookbook', component: Prompts },
  { hash: '#/reference', label: 'Settings reference', component: Reference },
];

function activeSection() {
  const hash = window.location.hash;
  return SECTIONS.find((section) => section.hash && hash.startsWith(section.hash)) ?? SECTIONS[0];
}

function App() {
  const [section, setSection] = useState(activeSection);

  useEffect(() => {
    const onHashChange = () => {
      const next = activeSection();
      setSection((prev) => {
        if (prev !== next) window.scrollTo(0, 0);
        return next;
      });
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const Body = section.component;

  return (
    <>
      <header className="docs-header">
        <a className="docs-brand" href="/">
          <span className="docs-brand-mark">ト</span>
          <span className="docs-brand-word">TOONLAB</span>
          <span className="docs-brand-tag">Open Source</span>
        </a>
        <nav className="docs-topnav">
          <a href="/">Labs</a>
          <a href="/gallery/">Gallery</a>
          <a href="/docs/" aria-current="page">Docs</a>
          <a href="/settings/">Settings</a>
          <a href={GITHUB} target="_blank" rel="noreferrer">GitHub</a>
        </nav>
      </header>
      <div className="docs-frame">
        <aside className="docs-side">
          <div className="docs-side-label">Documentation</div>
          <nav className="docs-nav">
            {SECTIONS.map((item) => (
              <a
                key={item.label}
                href={item.hash || '#'}
                className={item === section ? 'active' : undefined}
                onClick={(event) => {
                  if (!item.hash) {
                    event.preventDefault();
                    history.pushState(null, '', window.location.pathname);
                    setSection(SECTIONS[0]);
                    window.scrollTo(0, 0);
                  }
                }}
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="docs-side-foot">
            <a href={GITHUB} target="_blank" rel="noreferrer">GitHub</a>
            <a href="https://www.npmjs.com/package/@call-me-sensei/toonlab" target="_blank" rel="noreferrer">npm</a>
            <a href="https://toonlab.io/docs" target="_blank" rel="noreferrer">Pro docs</a>
          </div>
        </aside>
        <main className="docs-main">
          <Body />
        </main>
      </div>
    </>
  );
}

createRoot(document.getElementById('app')).render(<App />);
