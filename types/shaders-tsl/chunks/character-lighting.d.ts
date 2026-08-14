export function createLightingChunk({ u, tex, v, flags, frontFacingNode, cameraViewMatrixNode }: {
    u: any;
    tex: any;
    v: any;
    flags: any;
    frontFacingNode: any;
    cameraViewMatrixNode: any;
}): {
    applyAverageShadowVisibility: (visibility: any, sceneShadowVisibility: any, selfShadowVisibility: any) => import("three/webgpu").Node<"float">;
    calcCelShade: (N: any, L: any) => import("three/webgpu").Node<"float">;
    calculateRimMask: (NoV: any, NoL: any, finalShadowArea: any, depthRim: any) => import("three/webgpu").Node<"float">;
    evaluateDepthEffects: (N: any, L: any, NoL: any, NoV: any) => {
        contactShadow: import("three/webgpu").VarNode<"float", import("three/webgpu").VarNode<"float", import("three/webgpu").ConstNode<"float", number>>>;
        depthRim: import("three/webgpu").VarNode<"float", import("three/webgpu").VarNode<"float", import("three/webgpu").ConstNode<"float", number>>>;
    };
    getCharacterSelfShadowVisibility: (sceneShadowVisibility: any) => import("three/webgpu").Node<"float">;
    localLightBand: (normal: any, lightDirection: any) => import("three/webgpu").Node<"float">;
    resolveLightingNormal: (normal: any) => import("three/webgpu").Node<"vec2">;
    toonEdgeSmooth: (value: any, edgeMin: any, edgeMax: any) => import("three/webgpu").Node<"float">;
};
