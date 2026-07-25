#!/usr/bin/env python3
"""Image-space measurements for the deterministic single-rock checkpoint.

This is deliberately a measurement tool, not a screenshot-tuning oracle. The
shared contract fixes the scene. These probes report what each renderer did:
ground framing, rock silhouette, material color, and the cast-shadow footprint.
"""

from __future__ import annotations

import argparse
from collections import deque
import json
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CHECKPOINT = ROOT / "assets-local" / "parity" / "single-rock"


def load_rgb(path: Path) -> np.ndarray:
    with Image.open(path) as image:
        return np.asarray(image.convert("RGB"), dtype=np.uint8)


def quantized_dominant_color(image: np.ndarray) -> np.ndarray:
    pixels = image.reshape(-1, 3)
    visible = pixels[np.max(pixels, axis=1) > 4]
    quantized = (visible >> 2).astype(np.int32)
    keys = (quantized[:, 0] << 12) | (quantized[:, 1] << 6) | quantized[:, 2]
    winner = int(np.bincount(keys, minlength=1 << 18).argmax())
    winner_channels = np.array(
        [(winner >> 12) & 63, (winner >> 6) & 63, winner & 63],
        dtype=np.int32,
    )
    selected = visible[np.all(quantized == winner_channels, axis=1)]
    return np.median(selected.astype(np.float32), axis=0)


def dilation(mask: np.ndarray) -> np.ndarray:
    height, width = mask.shape
    padded = np.pad(mask, 1, mode="constant", constant_values=False)
    result = np.zeros_like(mask)
    for y in range(3):
        for x in range(3):
            result |= padded[y : y + height, x : x + width]
    return result


def geometry_id_mask(image: np.ndarray) -> np.ndarray:
    """Decode the renderer-neutral flat-white rock ID pass."""
    return np.max(image, axis=2) > 128


def largest_connected_component(mask: np.ndarray) -> np.ndarray:
    """Discard isolated raster noise without changing the surviving footprint."""
    height, width = mask.shape
    visited = np.zeros_like(mask)
    largest: list[tuple[int, int]] = []
    for start_y, start_x in np.argwhere(mask):
        y0 = int(start_y)
        x0 = int(start_x)
        if visited[y0, x0]:
            continue
        visited[y0, x0] = True
        pending = deque([(y0, x0)])
        component: list[tuple[int, int]] = []
        while pending:
            y, x = pending.popleft()
            component.append((y, x))
            for neighbor_y in range(max(0, y - 1), min(height, y + 2)):
                for neighbor_x in range(max(0, x - 1), min(width, x + 2)):
                    if (
                        mask[neighbor_y, neighbor_x]
                        and not visited[neighbor_y, neighbor_x]
                    ):
                        visited[neighbor_y, neighbor_x] = True
                        pending.append((neighbor_y, neighbor_x))
        if len(component) > len(largest):
            largest = component
    result = np.zeros_like(mask)
    if largest:
        ys, xs = zip(*largest)
        result[np.asarray(ys), np.asarray(xs)] = True
    return result


def chebyshev_mask_error(left: np.ndarray, right: np.ndarray, maximum_radius: int = 160) -> int | None:
    if not left.any() or not right.any():
        return None
    left_dilated = left.copy()
    right_dilated = right.copy()
    for radius in range(maximum_radius + 1):
        left_contained = np.all(~left | right_dilated)
        right_contained = np.all(~right | left_dilated)
        if left_contained and right_contained:
            return radius
        left_dilated = dilation(left_dilated)
        right_dilated = dilation(right_dilated)
    return maximum_radius + 1


def intersection_over_union(left: np.ndarray, right: np.ndarray) -> float | None:
    union = left | right
    if not union.any():
        return None
    return float(np.count_nonzero(left & right) / np.count_nonzero(union))


def mask_bounds(mask: np.ndarray) -> list[int] | None:
    if not mask.any():
        return None
    ys, xs = np.where(mask)
    return [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]


def engine_masks(
    off: np.ndarray,
    hard: np.ndarray,
    geometry_id: np.ndarray,
) -> dict:
    ground_color = quantized_dominant_color(off)
    visible = np.max(off, axis=2) > 4
    rock = geometry_id_mask(geometry_id)
    # This checkpoint contains only rock, ground, and black clear color. The
    # binary rock pass therefore lets us identify the receiver independently
    # of the material/light response of any renderer.
    ground = visible & ~rock
    light_loss = np.mean(off.astype(np.float32) - hard.astype(np.float32), axis=2)
    cast_shadow = largest_connected_component(ground & (light_loss > 12.0))
    self_shadow = rock & (light_loss > 12.0)
    return {
        "ground": ground,
        "groundColor": ground_color,
        "rock": rock,
        "shadow": cast_shadow,
        "selfShadow": self_shadow,
        "visible": visible,
    }


def color_metrics(left: np.ndarray, right: np.ndarray, mask: np.ndarray) -> dict:
    if not mask.any():
        return {"meanAbsoluteError": None, "p95AbsoluteError": None, "maximumError": None}
    error = np.abs(left.astype(np.int16) - right.astype(np.int16))[mask]
    return {
        "meanAbsoluteError": float(np.mean(error)),
        "p95AbsoluteError": float(np.percentile(error, 95)),
        "maximumError": int(np.max(error)),
    }


def shadow_hue_metrics(
    image: np.ndarray,
    mask: np.ndarray,
    acceptance: dict | None,
) -> dict:
    if not mask.any():
        return {
            "pixelCount": 0,
            "meanRgb8": None,
            "chromaticityRgb": None,
            "blueMinusRedChromaticity": None,
            "blueMinusGreenChromaticity": None,
            "coveragePassesContract": False if acceptance else None,
            "chromaticityPassesContract": False if acceptance else None,
            "passesContract": False if acceptance else None,
        }
    mean_rgb = np.mean(image[mask].astype(np.float64), axis=0)
    channel_sum = float(np.sum(mean_rgb))
    chromaticity = mean_rgb / channel_sum if channel_sum > 0 else np.zeros(3)
    blue_minus_red = float(chromaticity[2] - chromaticity[0])
    blue_minus_green = float(chromaticity[2] - chromaticity[1])
    coverage_passes = None
    chromaticity_passes = None
    passes = None
    if acceptance:
        coverage_passes = int(np.count_nonzero(mask)) >= int(
            acceptance["minimumRegionPixelCount"]
        )
        chromaticity_passes = (
            blue_minus_red
            >= float(acceptance["minimumBlueMinusRedChromaticity"])
            and blue_minus_green
            >= float(acceptance["minimumBlueMinusGreenChromaticity"])
        )
        passes = coverage_passes and chromaticity_passes
    return {
        "pixelCount": int(np.count_nonzero(mask)),
        "meanRgb8": mean_rgb.tolist(),
        "chromaticityRgb": chromaticity.tolist(),
        "blueMinusRedChromaticity": blue_minus_red,
        "blueMinusGreenChromaticity": blue_minus_green,
        "coveragePassesContract": coverage_passes,
        "chromaticityPassesContract": chromaticity_passes,
        "passesContract": passes,
    }


def compare_engine(reference_images: dict, reference_masks: dict, images: dict, masks: dict) -> dict:
    visible_union = reference_masks["visible"] | masks["visible"]
    rock_intersection = reference_masks["rock"] & masks["rock"]
    cast_shadow_intersection = reference_masks["shadow"] & masks["shadow"]
    self_shadow_intersection = reference_masks["selfShadow"] & masks["selfShadow"]
    return {
        "groundDominantColorRgb8": masks["groundColor"].tolist(),
        "groundFraming": {
            "chebyshevPixelError": chebyshev_mask_error(
                reference_masks["ground"], masks["ground"]
            ),
            "intersectionOverUnion": intersection_over_union(
                reference_masks["ground"], masks["ground"]
            ),
        },
        "rockSilhouette": {
            "chebyshevPixelError": chebyshev_mask_error(
                reference_masks["rock"], masks["rock"]
            ),
            "intersectionOverUnion": intersection_over_union(
                reference_masks["rock"], masks["rock"]
            ),
            "pixelCount": int(np.count_nonzero(masks["rock"])),
            "boundsInclusiveXyxy": mask_bounds(masks["rock"]),
        },
        "castShadow": {
            "chebyshevPixelError": chebyshev_mask_error(
                reference_masks["shadow"], masks["shadow"]
            ),
            "intersectionOverUnion": intersection_over_union(
                reference_masks["shadow"], masks["shadow"]
            ),
        },
        "offFrameColor": color_metrics(
            reference_images["off"], images["off"], visible_union
        ),
        "offRockColor": color_metrics(
            reference_images["off"], images["off"], rock_intersection
        ),
        "hardCastShadowColor": color_metrics(
            reference_images["hard"], images["hard"], cast_shadow_intersection
        ),
        "hardSelfShadowColor": color_metrics(
            reference_images["hard"], images["hard"], self_shadow_intersection
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--write",
        type=Path,
        help="Optional JSON destination; stdout is always emitted.",
    )
    parser.add_argument(
        "--profile",
        help="Profile id from profiles.json; defaults to the registry default.",
    )
    arguments = parser.parse_args()

    registry = json.loads((CHECKPOINT / "profiles.json").read_text())
    profile_id = arguments.profile or registry["defaultProfileId"]
    profile = next(
        (candidate for candidate in registry["profiles"] if candidate["id"] == profile_id),
        None,
    )
    if profile is None:
        raise RuntimeError(f"Unknown parity profile: {profile_id}")
    profile_root = CHECKPOINT / profile["path"]
    contract = json.loads((profile_root / "contract.json").read_text())
    if contract.get("profileId") != profile_id:
        raise RuntimeError(
            f"Profile registry/contract mismatch: {profile_id} vs "
            f"{contract.get('profileId')}"
        )
    paths = {
        "unity": {
            "off": profile_root / "unity-shadow-off.png",
            "hard": profile_root / "unity-shadow-hard.png",
            "geometry": profile_root / "unity-geometry-id.png",
        },
        "toonlab": {
            "off": profile_root / "toonlab-shadow-off.png",
            "hard": profile_root / "toonlab-shadow-hard.png",
            "geometry": profile_root / "toonlab-geometry-id.png",
        },
        "unreal": {
            "off": profile_root / "unreal" / "unreal-shadow-off.png",
            "hard": profile_root / "unreal" / "unreal-shadow-hard.png",
            "geometry": profile_root / "unreal" / "unreal-geometry-id.png",
        },
    }
    images = {
        engine: {mode: load_rgb(path) for mode, path in modes.items()}
        for engine, modes in paths.items()
    }
    shapes = {
        tuple(image.shape)
        for engine_images in images.values()
        for image in engine_images.values()
    }
    if shapes != {(contract["render"]["height"], contract["render"]["width"], 3)}:
        raise RuntimeError(f"Capture dimensions do not match the contract: {sorted(shapes)}")

    height, width = images["unity"]["off"].shape[:2]
    masks = {
        engine: engine_masks(
            engine_images["off"],
            engine_images["hard"],
            engine_images["geometry"],
        )
        for engine, engine_images in images.items()
    }
    comparisons = {
        engine: compare_engine(images["unity"], masks["unity"], images[engine], masks[engine])
        for engine in ("toonlab", "unreal")
    }
    silhouette_limit = contract["acceptance"]["geometrySilhouetteMaximumPixelError"]
    comparisons["toonlab"]["rockSilhouette"]["passesContract"] = (
        comparisons["toonlab"]["rockSilhouette"]["chebyshevPixelError"]
        <= silhouette_limit
    )
    comparisons["unreal"]["rockSilhouette"]["passesContract"] = (
        comparisons["unreal"]["rockSilhouette"]["chebyshevPixelError"]
        <= silhouette_limit
    )
    hue_acceptance = profile.get("acceptance", {}).get("blueShadowHue")
    shadow_hue = {
        engine: {
            "castShadow": shadow_hue_metrics(
                engine_images["hard"], masks[engine]["shadow"], hue_acceptance
            ),
            "selfShadow": shadow_hue_metrics(
                engine_images["hard"], masks[engine]["selfShadow"], hue_acceptance
            ),
        }
        for engine, engine_images in images.items()
    }
    for engine_metrics in shadow_hue.values():
        engine_metrics["chromaticityPassesContract"] = (
            engine_metrics["castShadow"]["chromaticityPassesContract"]
            and engine_metrics["selfShadow"]["chromaticityPassesContract"]
        ) if hue_acceptance else None
        engine_metrics["coveragePassesContract"] = (
            engine_metrics["castShadow"]["coveragePassesContract"]
            and engine_metrics["selfShadow"]["coveragePassesContract"]
        ) if hue_acceptance else None
        engine_metrics["passesContract"] = (
            engine_metrics["castShadow"]["passesContract"]
            and engine_metrics["selfShadow"]["passesContract"]
        ) if hue_acceptance else None
    blue_shadow_gate = {
        "enabled": hue_acceptance is not None,
        "acceptance": hue_acceptance,
        "allEnginesPass": (
            all(metrics["passesContract"] for metrics in shadow_hue.values())
            if hue_acceptance else None
        ),
        "allEnginesChromaticityPass": (
            all(
                metrics["chromaticityPassesContract"]
                for metrics in shadow_hue.values()
            ) if hue_acceptance else None
        ),
        "coveragePendingEngines": (
            [
                engine
                for engine, metrics in shadow_hue.items()
                if not metrics["coveragePassesContract"]
            ] if hue_acceptance else []
        ),
    }

    display_transfer_acceptance = profile.get("acceptance", {}).get(
        "displayTransfer"
    )
    display_transfer = None
    if display_transfer_acceptance:
        display_reference_engine = display_transfer_acceptance["referenceEngine"]
        if display_reference_engine not in images:
            raise RuntimeError(
                "Unknown display-transfer reference engine: "
                f"{display_reference_engine}"
            )
        display_transfer = {
            "referenceEngine": display_reference_engine,
            "status": display_transfer_acceptance.get("status"),
            "policy": display_transfer_acceptance.get("policy"),
            "comparisons": {
                engine: compare_engine(
                    images[display_reference_engine],
                    masks[display_reference_engine],
                    images[engine],
                    masks[engine],
                )
                for engine in images
                if engine != display_reference_engine
            },
        }

    report = {
        "schema": "toonlab.tri-engine-parity-image-measurement",
        "version": 5,
        "checkpoint": contract["checkpoint"],
        "profileId": profile_id,
        "referenceEngine": "unity",
        "captureDimensions": [width, height],
        "geometryMaskThresholdRgb8": 128,
        "castShadowLightLossThresholdRgb8": 12,
        "unity": {
            "groundDominantColorRgb8": masks["unity"]["groundColor"].tolist(),
            "rockMaskPixelCount": int(np.count_nonzero(masks["unity"]["rock"])),
            "rockMaskBoundsInclusiveXyxy": mask_bounds(masks["unity"]["rock"]),
            "castShadowPixelCount": int(np.count_nonzero(masks["unity"]["shadow"])),
            "selfShadowPixelCount": int(np.count_nonzero(masks["unity"]["selfShadow"])),
        },
        "shadowHue": shadow_hue,
        "blueShadowHueGate": blue_shadow_gate,
        "comparisons": comparisons,
        "displayTransfer": display_transfer,
    }
    serialized = json.dumps(report, indent=2) + "\n"
    print(serialized, end="")
    if arguments.write:
        arguments.write.parent.mkdir(parents=True, exist_ok=True)
        arguments.write.write_text(serialized)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
