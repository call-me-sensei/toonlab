// Lightweight P18 preview contract shared by sky/cloud-only labs.
//
// Keep this file independent of the full hillside scene. A cloud or sky lab
// must not download/import rock, ground, vegetation, manufactured-surface, or
// ground-field runtime code merely to resolve the accepted sky context.

const PROFILE_REGISTRY_URL = '/assets-local/parity/single-rock/profiles.json';
const PROFILE_ROOT_URL = '/assets-local/parity/single-rock';

const TIME_ANCHORS = Object.freeze([
  Object.freeze({
    ambientColor: [0.20, 0.28, 0.48],
    ambientEnergy: 0.72,
    currentTime: 950,
    dayCycleProgress: 0.75,
    directColor: [1.0, 0.55, 0.31],
    directEnergy: 0.58,
    elevationDegrees: 10,
    hour: 6,
    reverseAzimuth: true,
    skyEnergy: 0.82,
    skyTint: [0.72, 0.66, 0.82],
  }),
  Object.freeze({
    ambientColor: [1, 1, 1],
    ambientEnergy: 1,
    currentTime: 250,
    dayCycleProgress: 0,
    directColor: [1, 1, 1],
    directEnergy: 1,
    elevationDegrees: null,
    hour: 13,
    reverseAzimuth: false,
    skyEnergy: 1,
    skyTint: [1, 1, 1],
  }),
  Object.freeze({
    ambientColor: [0.18, 0.20, 0.45],
    ambientEnergy: 0.68,
    currentTime: 575,
    dayCycleProgress: 0.25,
    directColor: [1.0, 0.38, 0.16],
    directEnergy: 0.48,
    elevationDegrees: 8,
    hour: 18,
    reverseAzimuth: false,
    skyEnergy: 0.66,
    skyTint: [0.68, 0.48, 0.72],
  }),
  Object.freeze({
    ambientColor: [0.08, 0.15, 0.36],
    ambientEnergy: 0.42,
    currentTime: 740,
    dayCycleProgress: 0.5,
    directColor: [0.24, 0.38, 0.74],
    directEnergy: 0.16,
    elevationDegrees: 38,
    hour: 22,
    reverseAzimuth: true,
    skyEnergy: 0.34,
    skyTint: [0.10, 0.18, 0.42],
  }),
  Object.freeze({
    ambientColor: [0.20, 0.28, 0.48],
    ambientEnergy: 0.72,
    currentTime: 950,
    dayCycleProgress: 0.75,
    directColor: [1.0, 0.55, 0.31],
    directEnergy: 0.58,
    elevationDegrees: 10,
    hour: 30,
    reverseAzimuth: true,
    skyEnergy: 0.82,
    skyTint: [0.72, 0.66, 0.82],
  }),
]);

function lerpNumber(from, to, amount) {
  return from + ((to - from) * amount);
}

function lerpArray(from, to, amount) {
  return from.map((value, index) => lerpNumber(value, to[index], amount));
}

export function sampleP18ReferenceTime(hourInput) {
  const normalizedHour = ((Number(hourInput) % 24) + 24) % 24;
  const hour = normalizedHour < 6 ? normalizedHour + 24 : normalizedHour;
  let from = TIME_ANCHORS[0];
  let to = TIME_ANCHORS[1];
  for (let index = 0; index < TIME_ANCHORS.length - 1; index += 1) {
    if (hour >= TIME_ANCHORS[index].hour && hour <= TIME_ANCHORS[index + 1].hour) {
      from = TIME_ANCHORS[index];
      to = TIME_ANCHORS[index + 1];
      break;
    }
  }
  const amount = (hour - from.hour) / Math.max(to.hour - from.hour, 0.0001);
  return {
    ambientColor: lerpArray(from.ambientColor, to.ambientColor, amount),
    ambientEnergy: lerpNumber(from.ambientEnergy, to.ambientEnergy, amount),
    currentTime: lerpNumber(from.currentTime, to.currentTime, amount),
    dayCycleProgress: lerpNumber(
      from.dayCycleProgress,
      to.dayCycleProgress,
      amount,
    ),
    directColor: lerpArray(from.directColor, to.directColor, amount),
    directEnergy: lerpNumber(from.directEnergy, to.directEnergy, amount),
    from,
    skyEnergy: lerpNumber(from.skyEnergy, to.skyEnergy, amount),
    skyTint: lerpArray(from.skyTint, to.skyTint, amount),
    to,
    amount,
  };
}

export async function loadP18ReferenceContract() {
  const registryResponse = await fetch(PROFILE_REGISTRY_URL, { cache: 'no-store' });
  if (!registryResponse.ok) {
    throw new Error('P18 profile registry is unavailable.');
  }
  const registry = await registryResponse.json();
  const profile = registry.profiles?.find(
    (entry) => entry.materialCheckpoint === 'stylized-basic',
  );
  if (!profile?.contractPath) {
    throw new Error('The accepted P18 comparison profile is missing.');
  }
  const response = await fetch(
    `${PROFILE_ROOT_URL}/${profile.contractPath}/contract.json`,
    { cache: 'no-store' },
  );
  if (!response.ok) {
    throw new Error('The accepted P18 outdoor contract is unavailable.');
  }
  const inherited = await response.json();
  return {
    ...inherited,
    checkpoint: profile.checkpoint ?? inherited.checkpoint,
    inheritedProfileId: inherited.profileId,
    materialCheckpoint: profile.materialCheckpoint,
    profileId: profile.id,
  };
}
