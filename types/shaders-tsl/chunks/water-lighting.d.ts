export function createWaterLightingChunk({ u }: {
    u: any;
}): {
    fresnelFactor: (viewDir: any, surfaceNormal: any) => import("three/webgpu").Node<"float">;
    proceduralSky: (reflectDir: any) => import("three/webgpu").Node<"float">;
    reflectionColor: (worldPosition: any, surfaceNormal: any, viewDir: any) => import("three/webgpu").VarNode<"vec3", import("three/webgpu").VarNode<"vec3", import("three/webgpu").ConvertNode<"vec3">>>;
    sparkles: (restXZ: any, surfaceNormal: any, viewDir: any, viewDistance: any, time: any) => import("three/webgpu").VarNode<"vec3", import("three/webgpu").VarNode<"vec3", import("three/webgpu").ConstNode<"vec3", import("three").Vector3>>>;
    specular: (viewDir: any, surfaceNormal: any, shadowFactor: any) => any;
};
