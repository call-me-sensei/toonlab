export const LUMA: import("three/webgpu").VarNode<"vec3", import("three/webgpu").ConstNode<"vec3", import("three").Vector3>>;
export const maxColorComponent: import("three/src/nodes/TSL.js").FnNode<[], import("three/webgpu").Node<"float">>;
export const rgbToHsv: import("three/src/nodes/TSL.js").FnNode<[], import("three/webgpu").VarNode<"vec3", import("three/webgpu").JoinNode<"vec3">>>;
export const hsvToRgb: import("three/src/nodes/TSL.js").FnNode<[], any>;
export const applyHSVChange: import("three/src/nodes/TSL.js").FnNode<[], any>;
export const adjustSaturation: import("three/src/nodes/TSL.js").FnNode<[], import("three/webgpu").Node<"vec3">>;
