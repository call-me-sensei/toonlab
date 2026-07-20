import * as THREE from 'three';

import { createTreeLeafNodeMaterial } from '../shaders-tsl/tree-leaf.js';

// Modern anime-style tree canopies: instead of a lumpy low-poly blob, the crown is
// built from hundreds of camera-facing leaf-cluster cards sampled over a set
// of overlapping sphere "blobs". Each card's shading normal is baked to point
// outward from the canopy core, so the toon ramp lights the whole crown as a
// single soft volume — the core trick behind modern anime style trees.
//
//   const geometry = createTreeFoliageGeometry({ seed: 3 });
//   const { material, depthMaterial } = createTreeFoliageMaterials({ color: 0x4da258 });
//   const canopy = new THREE.Mesh(geometry, material);
//   canopy.customDepthMaterial = depthMaterial;   // leafy cast shadows
//   canopy.castShadow = true;
//   material.uniforms.uTime.value += delta;       // each frame

// Deterministic RNG so tree variants are stable across reloads.
function mulberry32(seed) {
  let state = Math.floor(seed * 1e6) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fallback blob layout: one big core with satellite lobes. Prefer
// createCanopyBlobs() for real trees — identical blobs make every crown the
// same near-sphere.
export const TREE_FOLIAGE_BLOBS = [
  { offset: [0, 0, 0], radius: 1.0 },
  { offset: [-0.58, -0.3, 0.12], radius: 0.62 },
  { offset: [0.54, -0.34, -0.16], radius: 0.58 },
  { offset: [0.14, 0.48, 0.06], radius: 0.56 },
  { offset: [-0.2, -0.12, 0.55], radius: 0.5 },
  { offset: [0.08, -0.2, -0.56], radius: 0.48 },
];

// Seeded irregular crown layout, anime-style: wider than tall, asymmetric
// lobes ringing the core at varying heights, and sometimes an outrigger tuft
// on a long limb past the main mass. Feed the result to both
// createTreeSkeleton and createTreeFoliageGeometry so limbs and leaves agree.
//   spread  — horizontal reach of the lobes (1 ≈ core radius)
//   width   — X-axis reach multiplier; depth — Z-axis reach multiplier.
//             width 1.6 / depth 0.7 gives a wide, shallow hedge-like crown.
//   flatten — vertical squash; low values give the wide, layered look
export function createCanopyBlobs({
  lobeCount = 6,
  spread = 1.25,
  width = 1,
  depth = 1,
  flatten = 0.5,
  coreRadius = 0.9,
  lobeRadiusRange = [0.45, 0.78],
  outriggerChance = 0.65,
  seed = 1,
} = {}) {
  const rng = mulberry32(seed + 5.13);
  const blobs = [{ offset: [0, 0.05, 0], radius: coreRadius }];
  for (let i = 0; i < lobeCount; i += 1) {
    const angle = (i / lobeCount) * Math.PI * 2 + (rng() - 0.5) * 1.4;
    const distance = spread * (0.5 + rng() * 0.55);
    blobs.push({
      offset: [
        Math.cos(angle) * distance * width,
        (rng() * 2 - 0.65) * flatten,
        Math.sin(angle) * distance * depth,
      ],
      radius: THREE.MathUtils.lerp(lobeRadiusRange[0], lobeRadiusRange[1], rng()),
    });
  }
  if (rng() < outriggerChance) {
    const angle = rng() * Math.PI * 2;
    blobs.push({
      offset: [
        Math.cos(angle) * spread * 1.7 * width,
        (rng() - 0.6) * flatten,
        Math.sin(angle) * spread * 1.7 * depth,
      ],
      radius: lobeRadiusRange[0] * (0.8 + rng() * 0.4),
    });
  }
  return blobs;
}

// Alpha-cutout leaf-cluster sprite drawn at runtime (no texture assets).
// The card must read as FOLIAGE: a dense mass of many distinct small leaves.
// Heavy overlap keeps the middle solid (so crowns never look like confetti)
// while individual leaf silhouettes stay visible on the rim and as strong
// per-leaf luminance variation inside (so it never looks like a smooth
// cloud-blob either). Leaves are drawn inside-out: dark random-facing
// interior leaves first, bright outward-pointing rim leaves on top.
// RGB holds per-leaf luminance, alpha holds the cutout silhouette.
/**
 * Traces one leaf silhouette into the 2D context, centered at the origin,
 * `length` tall along Y and `width` wide. Shared by the crown sprite, the
 * designer's shape previews, and the falling-leaf particles, so a shape
 * choice looks identical everywhere.
 *
 * @param {string} shape 'teardrop'|'round'|'maple'|'gingko'|'needle'|'custom'
 * @param {Array<[number, number]>|null} outline Normalized custom outline
 *   (points in -0.5..0.5 leaf-local space, y = tip direction).
 */
export function traceLeafShapePath(ctx, shape, length, width, outline = null) {
  ctx.beginPath();
  if (shape === 'custom' && outline?.length >= 3) {
    ctx.moveTo(outline[0][0] * width, outline[0][1] * length);
    for (let i = 1; i < outline.length; i += 1) {
      ctx.lineTo(outline[i][0] * width, outline[i][1] * length);
    }
  } else if (shape === 'round') {
    ctx.ellipse(0, 0, width * 0.52, length * 0.5, 0, 0, Math.PI * 2);
  } else if (shape === 'needle') {
    ctx.moveTo(0, -length * 0.5);
    ctx.quadraticCurveTo(width * 0.16, 0, 0, length * 0.5);
    ctx.quadraticCurveTo(-width * 0.16, 0, 0, -length * 0.5);
  } else if (shape === 'maple') {
    // Five-lobed star with pinched sinuses.
    const lobes = 5;
    for (let i = 0; i <= lobes * 2; i += 1) {
      const angle = -Math.PI / 2 + (i * Math.PI) / lobes;
      const radial = i % 2 === 0 ? 0.5 : 0.22;
      const x = Math.cos(angle) * width * radial;
      const y = Math.sin(angle) * length * radial;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  } else if (shape === 'gingko') {
    // Fan: narrow stem base opening to a wide notched top edge.
    ctx.moveTo(0, length * 0.5);
    ctx.quadraticCurveTo(width * 0.55, length * 0.25, width * 0.5, -length * 0.3);
    ctx.quadraticCurveTo(width * 0.2, -length * 0.52, 0, -length * 0.34);
    ctx.quadraticCurveTo(-width * 0.2, -length * 0.52, -width * 0.5, -length * 0.3);
    ctx.quadraticCurveTo(-width * 0.55, length * 0.25, 0, length * 0.5);
  } else {
    // Teardrop (default): round base, pointed tip.
    ctx.moveTo(0, -length * 0.5);
    ctx.quadraticCurveTo(width * 0.62, -length * 0.1, 0, length * 0.5);
    ctx.quadraticCurveTo(-width * 0.62, -length * 0.1, 0, -length * 0.5);
  }
  ctx.closePath();
}

export const LEAF_SHAPE_PRESETS = Object.freeze(['teardrop', 'round', 'maple', 'gingko', 'needle']);

export function createLeafSpriteTexture({
  size = 512,
  leafCount = 170,
  seed = 7,
  shape = 'teardrop',
  customOutline = null,
} = {}) {
  const rng = mulberry32(seed);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);

  const center = size / 2;
  const drawLeaf = (x, y, length, width, angle, luminance) => {
    const value = Math.round(THREE.MathUtils.clamp(luminance, 0, 1) * 255);
    ctx.fillStyle = `rgb(${value},${value},${value})`;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    traceLeafShapePath(ctx, shape, length, width, customOutline);
    ctx.fill();
    ctx.restore();
  };

  const leaves = [];
  for (let i = 0; i < leafCount; i += 1) {
    const angle = rng() * Math.PI * 2;
    // Clumpy reachable radius so the outline isn't a circle.
    const reach = 0.38 + 0.05 * Math.sin(angle * 3 + seed) + 0.04 * Math.sin(angle * 7 + 1.3);
    const radius = Math.pow(rng(), 0.52) * size * reach;
    const edgeT = Math.min(radius / (size * 0.4), 1);
    leaves.push({ angle, radius, edgeT, pick: rng(), spin: rng(), shade: rng() });
  }
  // Inside-out: rim leaves draw last, on top, with crisp silhouettes.
  leaves.sort((a, b) => a.radius - b.radius);
  leaves.forEach((leaf) => {
    const x = center + Math.cos(leaf.angle) * leaf.radius;
    const y = center + Math.sin(leaf.angle) * leaf.radius;
    const length = size * (0.095 + leaf.pick * 0.06);
    const width = length * (0.55 + leaf.spin * 0.3);
    // Interior leaves: darker, randomly oriented. Rim leaves: brighter,
    // pointing outward like real growth.
    const scatter = (1 - leaf.edgeT) * 2.6 + 0.5;
    const orientation = leaf.angle + Math.PI / 2 + (leaf.spin - 0.5) * scatter;
    const luminance = THREE.MathUtils.lerp(
      0.5 + leaf.shade * 0.22,
      0.76 + leaf.shade * 0.24,
      leaf.edgeT,
    );
    drawLeaf(x, y, length, width, orientation, luminance);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// Merged quad soup: 4 verts per card, position = card center, corners spread
// in the vertex shader (billboarding). Cards sit on the blob surfaces so the
// canopy silhouette stays clumpy rather than spherical.
// Few LARGE heavily-overlapping cards — not many small ones — is what makes
// crowns read as one fluffy mass (the classic three.js "fluffy trees"
// recipe). Small-card swarms read as floating confetti.
export function createTreeFoliageGeometry({
  blobs = TREE_FOLIAGE_BLOBS,
  cardCount = 170,
  cardSizeRange = [1.0, 1.6],
  // Overall canopy size multiplier (1 ≈ 1.6 m crown radius). For large trees
  // prefer raising cardCount alongside size so clusters stay leaf-scaled
  // instead of ballooning with the crown.
  size = 1,
  // Final world scale the tree renders at (object transform × size). Leaves
  // must stay leaf-sized no matter how big the tree gets, so coverage comes
  // from MORE cards, never bigger ones: card count scales with
  // coverageScale^2 (crown surface area), card size stays put.
  coverageScale = 1,
  // 0..1 leaf coverage. 1 = a solid crown; lower values thin the cards
  // overall, open see-through gap pockets in the silhouette, and clear the
  // underside so branches and sky show through from the side or below.
  leafDensity = 1,
  // Branch attachment points ({ position: Vector3, direction: Vector3 } in
  // canopy-local space, e.g. from createTreeSkeleton). When given, leaf
  // clusters grow as tufts around these points — no floating leaves — and
  // gap culling removes whole tufts, exposing the wood beneath. Without
  // attachments, cards sample the blob shells directly.
  attachments = null,
  cardsPerCluster = 5,
  clusterRadius = 0.48,
  // Per-attachment overrides keyed by attachment index:
  //   { [index]: { cardsPerCluster?, clusterRadius?, densityScale? } }
  // cardsPerCluster/clusterRadius replace the globals for that tuft;
  // densityScale multiplies its card count (0 = bare branch — the mandatory
  // minimum is waived when an explicit override asks for it).
  attachmentOverrides = null,
  // false = no blob-shell fill between the attachment tufts: the crown is
  // ONLY bushes at the branch ends and the wood in between stays on show
  // (the Sumeru bare-limb look). Only meaningful with attachments.
  shellFill = true,
  // When set, the blob-shell fill ADDS this many cards (scaled by density
  // and coverage) on top of whatever the attachments produced, instead of
  // only topping up to cardCount. Scribbled foliage areas need this: a
  // branch-tuft-heavy tree already exceeds the top-up budget, so painted
  // blobs would otherwise get zero cards.
  shellBudget = null,
  seed = 1,
} = {}) {
  const rng = mulberry32(seed + 11.7);
  const density = THREE.MathUtils.clamp(leafDensity, 0.05, 2);
  // Gap/culling math below is written for 0..1 coverage; density above 1
  // means "extra lush" and must never produce negative gap counts.
  const openness = Math.max(0, 1 - density);
  const coverage = Math.min(Math.max(coverageScale, 0.4) ** 2, 9);

  // Gap pockets: a few random directions on the crown where cards are very
  // likely to be culled, so patches of sky read through the canopy.
  const gapCount = Math.max(0, Math.round(1 + openness * 5 + rng() * 2));
  const gaps = Array.from({ length: gapCount }, () => {
    const theta = rng() * Math.PI * 2;
    const cosPhi = rng() * 2 - 1;
    const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
    return {
      direction: new THREE.Vector3(Math.cos(theta) * sinPhi, cosPhi, Math.sin(theta) * sinPhi),
      // Cosine threshold: wider pockets as density drops.
      cosRadius: Math.cos(0.35 + rng() * 0.3 + openness * 0.45),
    };
  });

  // Weight blob selection by surface area so lobes get even coverage.
  const weights = blobs.map((blob) => blob.radius * blob.radius);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  // Shading normals radiate from a core slightly below the canopy center,
  // which biases normals upward — tops read lit, undersides read shaded.
  const core = new THREE.Vector3(0, -0.35, 0);

  const cardCenter = new THREE.Vector3();
  const shadeNormal = new THREE.Vector3();
  let minY = Infinity;
  let maxY = -Infinity;

  const cardData = [];
  const targetCards = Math.round(cardCount * (0.4 + 0.6 * density) * coverage);

  // Gap pockets + underside thinning; culls by the card's direction from the
  // canopy core, so lower density opens believable holes instead of a
  // uniform thinning.
  const isCulled = (direction) => {
    for (const gap of gaps) {
      if (direction.dot(gap.direction) > gap.cosRadius && rng() < 0.55 + openness * 0.4) {
        return true;
      }
    }
    return direction.y < -0.25 && rng() < openness * 0.85;
  };

  // attachment = index of the tuft's branch end, -1 for shell-fill cards —
  // baked into the aAttachment vertex attribute so pointer picks can map a
  // leaf card back to its branch.
  const pushCard = (cardRng = rng, attachment = -1) => {
    shadeNormal.copy(cardCenter).sub(core).normalize();
    cardCenter.multiplyScalar(size);
    minY = Math.min(minY, cardCenter.y);
    maxY = Math.max(maxY, cardCenter.y);
    cardData.push({
      attachment,
      center: cardCenter.clone(),
      normal: shadeNormal.clone(),
      size: THREE.MathUtils.lerp(cardSizeRange[0], cardSizeRange[1], cardRng()) * size,
      phase: cardRng(),
      tint: cardRng(),
    });
  };

  // Card on a blob shell — the base fill that keeps the crown a solid mass.
  const sampleShellCard = () => {
    let pick = rng() * totalWeight;
    let blobIndex = 0;
    while (pick > weights[blobIndex] && blobIndex < blobs.length - 1) {
      pick -= weights[blobIndex];
      blobIndex += 1;
    }
    const blob = blobs[blobIndex];
    const theta = rng() * Math.PI * 2;
    const cosPhi = rng() * 2 - 1;
    const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
    const shell = blob.radius * (0.72 + rng() * 0.3);
    cardCenter.set(
      Math.cos(theta) * sinPhi * shell + blob.offset[0],
      cosPhi * shell + blob.offset[1],
      Math.sin(theta) * sinPhi * shell + blob.offset[2],
    );
    shadeNormal.copy(cardCenter).sub(core).normalize();
    if (isCulled(shadeNormal)) return;
    pushCard();
  };

  if (attachments?.length) {
    // MANDATORY pass first: every attachment gets a full puff of cards
    // engulfing the branch end — dense terminal masses are what make the
    // anime look, and a skipped puff means a naked branch. Never culled,
    // never budget-capped. Each tuft draws from its OWN seeded rng so a
    // per-branch override reshapes only that tuft, never its neighbors.
    attachments.forEach((attachment, attachmentIndex) => {
      const tuftRng = mulberry32(seed * 3.7 + 17.9 + attachmentIndex * 101.3);
      const override = attachmentOverrides?.[attachmentIndex] ?? null;
      const tuftCardsPerCluster = override?.cardsPerCluster ?? cardsPerCluster;
      const tuftRadius = override?.clusterRadius ?? clusterRadius;
      const densityScale = override?.densityScale ?? 1;
      const rawCount = Math.round(
        tuftCardsPerCluster * (0.8 + tuftRng() * 0.5) * coverage * densityScale *
        Math.max(1, density));
      // Only an explicit override may bare a branch.
      const tuftCards = override ? Math.max(rawCount, 0) : Math.max(rawCount, 3);
      for (let i = 0; i < tuftCards; i += 1) {
        // Point in a sphere around the branch end, pushed slightly past it
        // along the growth direction so the wood tip is swallowed by leaves.
        const radius = tuftRadius * (0.35 + 0.65 * Math.cbrt(tuftRng()));
        const theta = tuftRng() * Math.PI * 2;
        const cosPhi = tuftRng() * 2 - 1;
        const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
        cardCenter.set(
          Math.cos(theta) * sinPhi,
          cosPhi,
          Math.sin(theta) * sinPhi,
        ).multiplyScalar(radius).add(attachment.position);
        if (attachment.direction) {
          cardCenter.addScaledVector(
            attachment.direction, (0.1 + tuftRng() * 0.35) * tuftRadius);
        }
        pushCard(tuftRng, attachmentIndex);
      }
    });
    // Then shell fill (gap-cullable) tops the crown up to a solid mass —
    // unless the caller wants bare wood between the tufts.
    if (shellFill) {
      const shellTarget = shellBudget != null
        ? cardData.length + Math.round(shellBudget * (0.4 + 0.6 * density) * coverage)
        : targetCards;
      let sampleBudget = cardCount * 4 * coverage;
      while (cardData.length < shellTarget && sampleBudget > 0) {
        sampleBudget -= 1;
        sampleShellCard();
      }
    }
  } else {
    let sampleBudget = cardCount * 4 * coverage;
    while (cardData.length < targetCards && sampleBudget > 0) {
      sampleBudget -= 1;
      sampleShellCard();
    }
  }

  const centers = new Float32Array(cardData.length * 4 * 3);
  const corners = new Float32Array(cardData.length * 4 * 2);
  const uvs = new Float32Array(cardData.length * 4 * 2);
  const shadeNormals = new Float32Array(cardData.length * 4 * 3);
  const infos = new Float32Array(cardData.length * 4 * 4);
  const attachmentIds = new Float32Array(cardData.length * 4);
  const indices = new Uint32Array(cardData.length * 6);

  const cornerOffsets = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  const cornerUvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
  cardData.forEach((card, cardIndex) => {
    const heightT = (card.center.y - minY) / Math.max(maxY - minY, 1e-4);
    for (let corner = 0; corner < 4; corner += 1) {
      const vertex = cardIndex * 4 + corner;
      centers[vertex * 3] = card.center.x;
      centers[vertex * 3 + 1] = card.center.y;
      centers[vertex * 3 + 2] = card.center.z;
      corners[vertex * 2] = cornerOffsets[corner][0];
      corners[vertex * 2 + 1] = cornerOffsets[corner][1];
      uvs[vertex * 2] = cornerUvs[corner][0];
      uvs[vertex * 2 + 1] = cornerUvs[corner][1];
      shadeNormals[vertex * 3] = card.normal.x;
      shadeNormals[vertex * 3 + 1] = card.normal.y;
      shadeNormals[vertex * 3 + 2] = card.normal.z;
      infos[vertex * 4] = card.size;
      infos[vertex * 4 + 1] = card.phase;
      infos[vertex * 4 + 2] = card.tint;
      infos[vertex * 4 + 3] = heightT;
      attachmentIds[vertex] = card.attachment;
    }
    const base = cardIndex * 4;
    indices.set([base, base + 1, base + 2, base, base + 2, base + 3], cardIndex * 6);
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.setAttribute('position', new THREE.BufferAttribute(centers, 3));
  geometry.setAttribute('aCorner', new THREE.BufferAttribute(corners, 2));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('aShadeNormal', new THREE.BufferAttribute(shadeNormals, 3));
  geometry.setAttribute('aInfo', new THREE.BufferAttribute(infos, 4));
  // Branch-end index per card (-1 = shell fill), for pointer picking.
  geometry.setAttribute('aAttachment', new THREE.BufferAttribute(attachmentIds, 1));
  // Billboards expand past their centers; pad the bounds so culling and the
  // shadow camera keep the swaying crown fully inside.
  geometry.computeBoundingSphere();
  geometry.boundingSphere.radius += cardSizeRange[1] * size;
  return geometry;
}

function setSrgb(color, value) {
  if (Array.isArray(value)) {
    color.setRGB(value[0], value[1], value[2], THREE.SRGBColorSpace);
  } else {
    color.set(value);
  }
  return color;
}

// Flexible canopy color spec → concrete color. Accepts:
//   0x4da258 / '#4da258' / THREE.Color      — that color
//   [0.3, 0.63, 0.34]                       — sRGB triplet (all values ≤ 1)
//   [0x4da258, 0xe8c33c, '#d97b29']         — list: seeded random pick
//   { colors: [...] }                       — same as a list
//   { from: 0x4da258, to: 0xe8c33c }        — seeded random blend of the two
//   { hue: [0.08, 0.16], saturation: [0.6, 0.85], lightness: [0.45, 0.6] }
//                                           — seeded random HSL in ranges
// The same spec + seed always resolves to the same color, so forests are
// varied but stable across reloads.
export function resolveCanopyColor(spec, seed = 1) {
  const rng = mulberry32(seed * 3.71 + 9.23);
  const range = (value, fallback) => {
    if (Array.isArray(value)) {
      return THREE.MathUtils.lerp(value[0], value[1] ?? value[0], rng());
    }
    return value ?? fallback;
  };
  if (Array.isArray(spec)) {
    const isTriplet = spec.length === 3 &&
      spec.every((v) => typeof v === 'number' && v >= 0 && v <= 1);
    if (isTriplet) return setSrgb(new THREE.Color(), spec);
    return resolveCanopyColor(spec[Math.floor(rng() * spec.length)], seed + 1);
  }
  if (spec && typeof spec === 'object' && !spec.isColor) {
    if (spec.colors) {
      return resolveCanopyColor(spec.colors[Math.floor(rng() * spec.colors.length)], seed + 1);
    }
    if (spec.from !== undefined && spec.to !== undefined) {
      const from = setSrgb(new THREE.Color(), spec.from);
      const to = setSrgb(new THREE.Color(), spec.to);
      return from.lerp(to, rng());
    }
    return new THREE.Color().setHSL(
      range(spec.hue, 0.33),
      range(spec.saturation, 0.55),
      range(spec.lightness, 0.45),
      THREE.SRGBColorSpace,
    );
  }
  return setSrgb(new THREE.Color(), spec);
}

// Derive the anime three-tone palette from one canopy hue: cool dark
// shade, the base as the lit tone, and a warm bright crest for sun-struck
// crown tops (green trees crest toward yellow-green, yellow trees toward
// gold). Any tone can be pinned explicitly via `overrides` ({ lit, shadow,
// crown }) for full art direction.
export function deriveCanopyPalette(color, overrides = {}) {
  const lit = overrides.lit
    ? setSrgb(new THREE.Color(), overrides.lit)
    : setSrgb(new THREE.Color(), color);
  // The fixed hue rotations that work for greens break on warm canopies:
  // a gold tree's crown rotated -0.07 lands in salmon pink, and its shadow
  // rotated +0.045 lands in olive green — "why does my orange tree have
  // green leaves". Warm hues crest in place (paler gold, like a ginkgo)
  // and shade toward orange-brown; the crest also never rotates past gold.
  const GOLD_HUE = 0.118;
  const { h, l, s } = lit.getHSL({});
  const warm = h < 0.18 || h > 0.85;
  const shadow = overrides.shadow
    ? setSrgb(new THREE.Color(), overrides.shadow)
    : new THREE.Color().setHSL(
      (h + (warm ? -0.025 : 0.035) + 1) % 1,
      Math.min(s + 0.025, 1),
      // A relative floor protects dark source colors without ever making the
      // shadow brighter than its lit tone. The old fixed -0.16 shift became
      // a near-black canopy after sprite luminance and scene tint multiplied.
      Math.min(Math.max(l - 0.1, l * 0.74, 0.16), l * 0.96),
    );
  const crownShift = warm ? 0 : Math.max(h - 0.07, GOLD_HUE) - h;
  const crown = overrides.crown
    ? setSrgb(new THREE.Color(), overrides.crown)
    : lit.clone().offsetHSL(crownShift, 0.06, 0.14);
  return { lit, shadow, crown };
}

let sharedLeafSprite = null;
function defaultLeafSprite() {
  if (!sharedLeafSprite) sharedLeafSprite = createLeafSpriteTexture();
  return sharedLeafSprite;
}

// Shared uniform setters behind the setSun/setWind/... methods that every
// canopy-bearing class exposes (StylizedTree, StylizedTreeFoliage,
// StylizedBush): one implementation, thin delegates.
export function setCanopySun(uniforms, { direction, color, sky } = {}) {
  if (direction) {
    uniforms.uSunDirection.value.set(direction[0], direction[1], direction[2]).normalize();
  }
  if (color) setSrgb(uniforms.uSunColor.value, color);
  if (sky) setSrgb(uniforms.uSkyColor.value, sky);
}

export function setCanopyWind(uniforms, { direction, speed, strength } = {}) {
  if (direction) uniforms.uWindDirection.value.set(direction[0], direction[1]);
  if (Number.isFinite(speed)) uniforms.uWindSpeed.value = speed;
  if (Number.isFinite(strength)) uniforms.uWindStrength.value = strength;
}

export function setCanopySceneShadow(uniforms, { strength } = {}) {
  if (Number.isFinite(strength)) uniforms.uSceneShadowStrength.value = strength;
}

export function setCanopyCloudShadow(uniforms, { strength, coverage, scale, velocity } = {}) {
  if (Number.isFinite(strength)) uniforms.uCloudShadowStrength.value = strength;
  if (Number.isFinite(coverage)) uniforms.uCloudShadowCoverage.value = coverage;
  if (Number.isFinite(scale)) uniforms.uCloudShadowScale.value = scale;
  if (velocity) {
    uniforms.uCloudShadowVelocity.value.set(
      velocity[0] ?? velocity.x ?? 0, velocity[1] ?? velocity.y ?? 0);
  }
}

export function tickCanopyTime(uniforms, delta) {
  uniforms.uTime.value += Math.min(Math.max(delta ?? 0.016, 0), 0.1);
}

// Color + shadow-depth material pair. Pass `sharedUniforms` (e.g. one uTime /
// sun block reused across every tree material) to drive all canopies from a
// single per-frame update.
export function createTreeFoliageMaterials({
  // Any resolveCanopyColor spec: single color, list, {from,to} blend, or
  // HSL ranges — resolved deterministically with `seed`.
  color = 0x4da258,
  // Pin any of { lit, shadow, crown } explicitly; the rest derive from color.
  palette: paletteOverrides = {},
  seed = 1,
  leafMap = null,
  // Low enough that mipmap-averaged alpha doesn't erode distant crowns.
  alphaCutoff = 0.3,
  windDirection = [1, 0.3],
  windSpeed = 1.0,
  windStrength = 0.05,
  sunDirection = [0.35, 0.72, 0.42],
  sunColor = [1.0, 0.96, 0.84],
  skyColor = [0.62, 0.78, 0.95],
  // How strongly renderer shadow maps shift the crown toward its shadow tone.
  sceneShadowStrength = 0.55,
  // Translucent glow on leaves between the camera and the sun.
  backlitStrength = 0.35,
  // Drifting procedural cloud shadows across the crown. strength 0 disables;
  // velocity is noise-space drift per second (worldDrift = velocity / scale).
  cloudShadowStrength = 0,
  cloudShadowCoverage = 0.45,
  cloudShadowScale = 0.012,
  cloudShadowVelocity = [0.02, 0.006],
  vegetationShader = null,
  sharedUniforms = {},
} = {}) {
  const palette = deriveCanopyPalette(resolveCanopyColor(color, seed), paletteOverrides);
  const map = leafMap ?? defaultLeafSprite();

  const material = createTreeLeafNodeMaterial({
    alphaCutoff,
    backlitStrength,
    cloudShadowCoverage,
    cloudShadowScale,
    cloudShadowStrength,
    cloudShadowVelocity,
    leafMap: map,
    sceneShadowStrength,
    windDirection,
    windSpeed,
    windStrength,
  }, vegetationShader);
  material.uniforms.uSunDirection.value.set(...sunDirection);
  setSrgb(material.uniforms.uSunColor.value, sunColor);
  setSrgb(material.uniforms.uSkyColor.value, skyColor);
  material.uniforms.uLitColor.value.copy(palette.lit);
  material.uniforms.uShadowColor.value.copy(palette.shadow);
  material.uniforms.uCrownColor.value.copy(palette.crown);

  // Shared classic uniform blocks (frozen playground callers) drive the
  // node uniforms through write-through wrappers: object values share the
  // instance, numeric values get accessor-backed sync.
  for (const [name, entry] of Object.entries(sharedUniforms)) {
    const node = material.uniforms[name];
    if (!node || !entry || typeof entry !== 'object') continue;
    if (entry.value !== null && typeof entry.value === 'object') {
      node.value = entry.value;
    } else {
      node.value = entry.value;
      Object.defineProperty(entry, 'value', {
        configurable: true,
        get: () => node.value,
        set: (next) => { node.value = next; },
      });
    }
  }

  // The mesh-level customDepthMaterial is the shared contract for both
  // three's native shadow pass and the Water Lab's node-backend sun pass.
  const depthMaterial = material.userData.createDepthColorVariant();
  return { material, depthMaterial, palette };
}

// Convenience mesh wrapper for non-React scenes.
export class StylizedTreeFoliage extends THREE.Mesh {
  constructor({ geometry: geometryOptions = {}, ...materialOptions } = {}) {
    const geometry = createTreeFoliageGeometry(geometryOptions);
    const { material, depthMaterial } = createTreeFoliageMaterials(materialOptions);
    super(geometry, material);
    this.name = 'StylizedTreeFoliage';
    this.customDepthMaterial = depthMaterial;
    this.castShadow = true;
    this.receiveShadow = true;
    this.frustumCulled = false;
    // Keep the loaded-scene material adapter from replacing the leaf shader.
    this.userData.environmentShaderExclude = true;
  }

  setSun(options) {
    setCanopySun(this.material.uniforms, options);
    return this;
  }

  setWind(options) {
    setCanopyWind(this.material.uniforms, options);
    return this;
  }

  // How strongly scene shadows (neighboring trees, the character) shift the
  // crown toward its shadow palette. 0 disables.
  setSceneShadow(options) {
    setCanopySceneShadow(this.material.uniforms, options);
    return this;
  }

  // Drifting procedural cloud shadows across the crown. strength 0 disables.
  setCloudShadow(options) {
    setCanopyCloudShadow(this.material.uniforms, options);
    return this;
  }

  update(delta) {
    tickCanopyTime(this.material.uniforms, delta);
    return this;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.customDepthMaterial?.dispose();
  }
}
