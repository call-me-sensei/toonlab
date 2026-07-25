#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { chromium } from 'playwright';

const [referenceArg, candidateArg] = process.argv.slice(2);
if (!referenceArg || !candidateArg) {
  console.error('Usage: node scripts/compare-source-render.mjs reference.png candidate.png [heatmap.png]');
  process.exit(1);
}

const referencePath = resolve(referenceArg);
const candidatePath = resolve(candidateArg);
const heatmapPath = resolve(
  process.argv[4] ?? '/private/tmp/toonlab-source-reference-heatmap.png',
);
const dataUrl = (path) => `data:image/png;base64,${readFileSync(path, 'base64')}`;
const launchOptions = { headless: true };
if (process.env.PLAYWRIGHT_BROWSER_CHANNEL) launchOptions.channel = process.env.PLAYWRIGHT_BROWSER_CHANNEL;
if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) launchOptions.executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;

const browser = await chromium.launch(launchOptions);
try {
  const page = await browser.newPage();
  const result = await page.evaluate(async ({ candidateUrl, referenceUrl }) => {
    const load = (src) => new Promise((resolveImage, reject) => {
      const image = new Image();
      image.onload = () => resolveImage(image);
      image.onerror = reject;
      image.src = src;
    });
    const [reference, candidate] = await Promise.all([
      load(referenceUrl),
      load(candidateUrl),
    ]);
    if (reference.width !== candidate.width || reference.height !== candidate.height) {
      throw new Error(
        `dimension mismatch: reference ${reference.width}x${reference.height}, candidate ${candidate.width}x${candidate.height}`,
      );
    }
    const width = reference.width;
    const height = reference.height;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(reference, 0, 0);
    const a = context.getImageData(0, 0, width, height).data;
    context.clearRect(0, 0, width, height);
    context.drawImage(candidate, 0, 0);
    const b = context.getImageData(0, 0, width, height).data;
    const heat = context.createImageData(width, height);
    const thresholds = [2, 5, 10, 20, 40];
    const thresholdCounts = Object.fromEntries(thresholds.map((value) => [value, 0]));
    const channelReference = [0, 0, 0];
    const channelCandidate = [0, 0, 0];
    const tilesX = 8;
    const tilesY = 4;
    const tiles = Array.from({ length: tilesX * tilesY }, (_, index) => ({
      column: index % tilesX,
      count: 0,
      lumaAbsoluteError: 0,
      rgbAbsoluteError: 0,
      row: Math.floor(index / tilesX),
    }));
    const toLinear = (value) => {
      const srgb = value / 255;
      return srgb <= 0.04045
        ? srgb / 12.92
        : ((srgb + 0.055) / 1.055) ** 2.4;
    };
    const luma = (pixels, offset) =>
      0.2126 * toLinear(pixels[offset])
      + 0.7152 * toLinear(pixels[offset + 1])
      + 0.0722 * toLinear(pixels[offset + 2]);

    let exactPixels = 0;
    let rgbAbsoluteError = 0;
    let rgbSquaredError = 0;
    let referenceLumaSum = 0;
    let candidateLumaSum = 0;
    let referenceLumaSquaredSum = 0;
    let candidateLumaSquaredSum = 0;
    let lumaProductSum = 0;
    let lumaAbsoluteError = 0;
    let lumaSquaredError = 0;
    const pixelCount = width * height;
    for (let offset = 0, pixel = 0; offset < a.length; offset += 4, pixel += 1) {
      let maxDelta = 0;
      let pixelAbsoluteError = 0;
      for (let channel = 0; channel < 3; channel += 1) {
        const delta = Math.abs(a[offset + channel] - b[offset + channel]);
        channelReference[channel] += a[offset + channel];
        channelCandidate[channel] += b[offset + channel];
        maxDelta = Math.max(maxDelta, delta);
        pixelAbsoluteError += delta;
        rgbAbsoluteError += delta;
        rgbSquaredError += delta * delta;
      }
      if (maxDelta === 0) exactPixels += 1;
      for (const threshold of thresholds) {
        if (maxDelta > threshold) thresholdCounts[threshold] += 1;
      }
      const referenceLuma = luma(a, offset);
      const candidateLuma = luma(b, offset);
      const lumaDelta = referenceLuma - candidateLuma;
      referenceLumaSum += referenceLuma;
      candidateLumaSum += candidateLuma;
      referenceLumaSquaredSum += referenceLuma * referenceLuma;
      candidateLumaSquaredSum += candidateLuma * candidateLuma;
      lumaProductSum += referenceLuma * candidateLuma;
      lumaAbsoluteError += Math.abs(lumaDelta);
      lumaSquaredError += lumaDelta * lumaDelta;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      const tileX = Math.min(Math.floor(x * tilesX / width), tilesX - 1);
      const tileY = Math.min(Math.floor(y * tilesY / height), tilesY - 1);
      const tile = tiles[tileY * tilesX + tileX];
      tile.count += 1;
      tile.lumaAbsoluteError += Math.abs(lumaDelta);
      tile.rgbAbsoluteError += pixelAbsoluteError / (3 * 255);

      const heatValue = Math.min(255, maxDelta * 5);
      heat.data[offset] = heatValue;
      heat.data[offset + 1] = Math.max(0, 180 - heatValue);
      heat.data[offset + 2] = 255 - heatValue;
      heat.data[offset + 3] = 255;
    }
    context.putImageData(heat, 0, 0);
    const heatmap = canvas.toDataURL('image/png').split(',')[1];
    const referenceMean = referenceLumaSum / pixelCount;
    const candidateMean = candidateLumaSum / pixelCount;
    const referenceVariance = referenceLumaSquaredSum / pixelCount - referenceMean ** 2;
    const candidateVariance = candidateLumaSquaredSum / pixelCount - candidateMean ** 2;
    const covariance = lumaProductSum / pixelCount - referenceMean * candidateMean;
    const c1 = 0.01 ** 2;
    const c2 = 0.03 ** 2;
    const globalSsim = ((2 * referenceMean * candidateMean + c1) * (2 * covariance + c2))
      / ((referenceMean ** 2 + candidateMean ** 2 + c1)
        * (referenceVariance + candidateVariance + c2));
    const rgbMse = rgbSquaredError / (pixelCount * 3 * 255 ** 2);
    return {
      heatmap,
      metrics: {
        candidateMeanRgb: channelCandidate.map((sum) => sum / pixelCount / 255),
        exactPixelFraction: exactPixels / pixelCount,
        globalSsim,
        height,
        hotspotTiles: tiles.map((tile) => ({
          column: tile.column,
          lumaMae: tile.lumaAbsoluteError / tile.count,
          rgbMae: tile.rgbAbsoluteError / tile.count,
          row: tile.row,
        })).sort((left, right) => right.lumaMae - left.lumaMae).slice(0, 8),
        linearLumaMae: lumaAbsoluteError / pixelCount,
        linearLumaMeanCandidate: candidateMean,
        linearLumaMeanReference: referenceMean,
        linearLumaRmse: Math.sqrt(lumaSquaredError / pixelCount),
        psnr: rgbMse === 0 ? null : -10 * Math.log10(rgbMse),
        referenceMeanRgb: channelReference.map((sum) => sum / pixelCount / 255),
        rgbMae: rgbAbsoluteError / (pixelCount * 3 * 255),
        rgbRmse: Math.sqrt(rgbMse),
        thresholdMismatchFraction: Object.fromEntries(
          thresholds.map((threshold) => [threshold, thresholdCounts[threshold] / pixelCount]),
        ),
        width,
      },
    };
  }, {
    candidateUrl: dataUrl(candidatePath),
    referenceUrl: dataUrl(referencePath),
  });
  writeFileSync(heatmapPath, Buffer.from(result.heatmap, 'base64'));
  console.log(JSON.stringify({
    candidatePath,
    heatmapPath,
    referencePath,
    ...result.metrics,
  }, null, 2));
} finally {
  await browser.close();
}
