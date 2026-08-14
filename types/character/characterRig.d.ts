export function normalizeMixamoBoneName(name: any): string;
export function resolveCharacterRig(targetMesh: any, { vrm }?: {
    vrm?: any;
}): {
    type: any;
    targetToMixamo: Map<any, any>;
    mixamoToTarget: Map<any, any>;
    hipCarrierName: any;
};
export function targetBoneNameForRole(rig: any, role: any): any;
export function targetBoneNamesForRole(rig: any, role: any): any[];
export const HUMANOID_ROLES: readonly string[];
export const MIXAMO_CHAIN_CHILD: Readonly<{
    mixamorigLeftShoulder: "mixamorigLeftArm";
    mixamorigLeftArm: "mixamorigLeftForeArm";
    mixamorigLeftForeArm: "mixamorigLeftHand";
    mixamorigLeftHand: "mixamorigLeftHandMiddle1";
    mixamorigRightShoulder: "mixamorigRightArm";
    mixamorigRightArm: "mixamorigRightForeArm";
    mixamorigRightForeArm: "mixamorigRightHand";
    mixamorigRightHand: "mixamorigRightHandMiddle1";
    mixamorigLeftUpLeg: "mixamorigLeftLeg";
    mixamorigLeftLeg: "mixamorigLeftFoot";
    mixamorigLeftFoot: "mixamorigLeftToeBase";
    mixamorigRightUpLeg: "mixamorigRightLeg";
    mixamorigRightLeg: "mixamorigRightFoot";
    mixamorigRightFoot: "mixamorigRightToeBase";
}>;
