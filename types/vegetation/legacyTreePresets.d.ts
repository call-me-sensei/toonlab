/** Returns one immutable legacy recipe document, or null. */
export function getLegacyTreePreset(id: any): any;
/** Lists the stable legacy IDs and labels without duplicating recipe data. */
export function getLegacyTreePresetOptions(): any;
/**
 * Creates one tree from the supported pre-species set.
 *
 * Overrides remain the ordinary StylizedTree contract, including `leafShape`,
 * `trunkMap`, `foliage.leafMap`, and `vegetationShader`. Nested generator and
 * material groups merge over the selected recipe instead of replacing it.
 */
export function createLegacyTree(id: any, overrides?: {}): StylizedTree;
/**
 * The twelve pre-species ToonLab trees, now named and versioned explicitly.
 *
 * This is the supported legacy set that existed before the repository's
 * botanical species research. It contains only generic stylized silhouettes;
 * none of the documents claims a botanical species identity.
 */
export const LEGACY_TREE_PRESETS: any;
export const LEGACY_TREE_IDS: any;
import { StylizedTree } from './stylizedTree.js';
