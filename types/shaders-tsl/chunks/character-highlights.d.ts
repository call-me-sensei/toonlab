export function createHighlightsChunk({ u, tex, v, flags, toonEdgeSmooth }: {
    u: any;
    tex: any;
    v: any;
    flags: any;
    toonEdgeSmooth: any;
}): {
    calculateEyeHighlightMask: (L: any, N: any, V: any, uv: any) => import("three/webgpu").Node<"float">;
    calculateHairHighlightMask: (V: any, N: any, H: any, uv: any, finalShadowArea: any) => import("three/webgpu").Node<"float">;
    calculateSpecularArea: (NoH: any, NoV: any, finalShadowArea: any, roughnessValue: any) => import("three/webgpu").Node<"float">;
    evaluateGlitter: (uv: any, V: any, N: any, L: any) => import("three/webgpu").VarNode<"vec3", import("three/webgpu").VarNode<"vec3", import("three/webgpu").ConstNode<"vec3", import("three").Vector3>>>;
};
