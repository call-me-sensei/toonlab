export function createMaterialMapChunk({ u, tex, v, flags }: {
    u: any;
    tex: any;
    v: any;
    flags: any;
}): {
    applyMaterialDetail: (albedo: any) => any;
    applyMaterialNormalMap: (N: any) => any;
    sampleMaterialAo: () => import("three/webgpu").Node<"float">;
    sampleMaterialDetail: () => import("three/webgpu").Node<"vec3">;
    sampleMaterialEmissive: () => any;
    sampleMaterialMatcap: (N: any) => import("three/webgpu").Node<"vec3">;
    sampleMaterialMetalness: () => import("three/webgpu").Node<"float">;
    sampleMaterialNormalMapColor: () => import("three/webgpu").Node<"vec3">;
    sampleMaterialRamp: (shadeArea: any) => import("three/webgpu").Node<"vec3">;
    sampleMaterialRoughness: () => import("three/webgpu").Node<"float">;
    sampleMaterialSpecularColor: () => import("three/webgpu").Node<"vec3">;
};
