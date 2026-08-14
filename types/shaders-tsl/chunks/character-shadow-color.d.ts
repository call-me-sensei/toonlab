export function createShadowColorChunk({ u }: {
    u: any;
}): {
    calculateShadowColor: (albedo: any, finalShadowArea: any) => import("three/webgpu").Node<"float">;
};
