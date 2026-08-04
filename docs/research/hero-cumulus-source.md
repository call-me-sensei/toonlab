# Hero cumulus source

The Sky & Cloud Lab's default hero cloud is a ToonLab-owned generated source,
not copied Dandewa or Genshin artwork. Genshin Impact was used only as the
visual target for macro-form, softness, palette, and level of stylization.

## Generation

- Tool: OpenAI built-in image generation
- Target reference: the Genshin-inspired open-world screenshot supplied in the
  Sky & Cloud Lab task
- Output: `labs/sky-cloud-lab/assets/hero-cumulus-v2.png`
- SHA-256: `53a65013fca21cd4f1497189ae5a08fb691f553c61096dd9104d356bff5936a1`

Final prompt:

> Create a production-ready source texture for a high-end stylized open-world
> game sky. Generate one coherent cumulus cloud bank with realistic macro
> structure: a broad horizontal base, naturally connected cauliflower lobes,
> one asymmetric rising crown, soft turbulent edge variation, and convincing
> internal depth. Match the supplied Genshin Impact reference's balance of
> realistic form and anime-clean shading, but do not copy its composition or
> any identifiable artwork. Use neutral, mostly overhead daylight so the asset
> can be relit at runtime: clean warm-white tops, restrained pale cyan-blue
> self-shadow, low-to-medium contrast, soft transitions, no crushed gray
> underside. Avoid stacked spheres, repeated bubbles, graphic outlines, cel
> bands, airbrushed blobs, painterly canvas texture, text, scenery, sun, and
> horizon. Isolate the full cloud with generous padding on a perfectly flat
> pure #00ff00 chroma background. Square, high resolution, crisp enough for a
> game texture while remaining soft and natural.

The chroma field was converted into a transparent alpha channel with green
despill. The second matte pass was selected after visual inspection because it
preserved the fine cloud fringe without punching holes through the interior.
