using UnrealBuildTool;

public class ToonLabLandscapeWeightExporter : ModuleRules
{
    public ToonLabLandscapeWeightExporter(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

        PublicDependencyModuleNames.AddRange(new[]
        {
            "Core",
            "CoreUObject",
            "Engine"
        });

        PrivateDependencyModuleNames.AddRange(new[]
        {
            "Json",
            "Landscape",
            "LandscapeEditor",
            "UnrealEd"
        });
    }
}

