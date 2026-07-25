# Unity Mega environment-reflection audit

The active Mega scene does not contain an omitted reflection implementation.
Its serialized and runtime-captured `RenderSettings` select Skybox reflections
at intensity 1 with one bounce, while both the skybox material and custom
reflection texture are null. The source-baseline glossy-environment radiance
is therefore black.

`SoStylizedUnityUrpLightingModel.indirectSpecular()` intentionally contributes
nothing and does not inherit `scene.environment`. Direct sun specular remains
active through the literal URP BRDF, and `S_StylizedWater` retains its own
authored cubemap branch independently.

Run `npm run verify:unity-reflections` to lock the scene YAML, exported
manifest, runtime capture report, and runtime no-radiance hook. A future
UE-quality profile may install captured radiance at this explicit hook without
changing the source-baseline result.
