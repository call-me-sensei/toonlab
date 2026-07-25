export function resolveSharedLightSelection(registry, {
  requestedLightMode = null,
  requestedProfileId = null,
} = {}) {
  const variants = registry.sharedLightVariants ?? [];
  const requestedProfile = registry.profiles.find(
    (candidate) => candidate.id === requestedProfileId,
  );
  const requestedProfileUsesSharedLight = variants.some(
    (candidate) => candidate.profileId === requestedProfile?.id,
  );
  const requestedLightVariant = variants.find(
    (candidate) => candidate.id === requestedLightMode,
  );
  const profile = (requestedLightVariant && (!requestedProfile || requestedProfileUsesSharedLight)
    ? registry.profiles.find((candidate) => candidate.id === requestedLightVariant.profileId)
    : requestedProfile)
    ?? registry.profiles.find((candidate) => candidate.id === registry.defaultProfileId);
  const activeLightVariant = variants.find(
    (candidate) => candidate.profileId === profile?.id,
  ) ?? null;
  return {
    activeLightVariant,
    lightMode: activeLightVariant?.id ?? profile?.lightDirectionMode ?? 'contract',
    profile,
  };
}
