#pragma once

#include "CoreMinimal.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "ToonLabLandscapeWeightExporterLibrary.generated.h"

class ALandscapeProxy;

/** Thin Python/Blueprint bridge to the supported UE 5.8 Landscape editor API. */
UCLASS()
class TOONLABLANDSCAPEWEIGHTEXPORTER_API UToonLabLandscapeWeightExporterLibrary
    : public UBlueprintFunctionLibrary
{
    GENERATED_BODY()

public:
    /**
     * Export the SnowPines material's ten final-merged paint inputs as
     * full-resolution .r8 files and write layout.json beside them. Inputs with
     * no Landscape allocation are exported through UE as exact zero masks.
     * Returns false with OutError on any missing LayerInfo asset, unexpected
     * size, or write failure.
     */
    UFUNCTION(BlueprintCallable, Category = "ToonLab|Landscape")
    static bool ExportLandscapeWeightLayers(
        ALandscapeProxy* Landscape,
        const FString& OutputDirectory,
        FString& OutLayoutPath,
        FString& OutError);
};
