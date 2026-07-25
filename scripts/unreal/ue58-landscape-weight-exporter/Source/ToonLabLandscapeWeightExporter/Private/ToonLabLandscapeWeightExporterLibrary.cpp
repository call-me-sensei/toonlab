#include "ToonLabLandscapeWeightExporterLibrary.h"

#include "Dom/JsonObject.h"
#include "Engine/Texture2D.h"
#include "HAL/FileManager.h"
#include "LandscapeComponent.h"
#include "LandscapeInfo.h"
#include "LandscapeLayerInfoObject.h"
#include "LandscapeProxy.h"
#include "Misc/EngineVersion.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"

namespace
{
const TArray<FName>& RequiredSnowPinesLayers()
{
    static const TArray<FName> Names = {
        TEXT("Grass"),
        TEXT("Dirt"),
        TEXT("Sand"),
        TEXT("Rock"),
        TEXT("SnowGrass"),
        TEXT("Snow"),
        TEXT("SnowGrassBlue"),
        TEXT("DesertSand"),
        TEXT("DesertGrass"),
        TEXT("DesertDirt"),
    };
    return Names;
}

FString ObjectPath(const UObject* Object)
{
    return Object ? Object->GetPathName() : FString();
}

FString BlendMethodName(const ELandscapeTargetLayerBlendMethod Method)
{
    if (const UEnum* Enum = StaticEnum<ELandscapeTargetLayerBlendMethod>())
    {
        return Enum->GetNameStringByValue(static_cast<int64>(Method));
    }
    return FString::FromInt(static_cast<int32>(Method));
}
}

bool UToonLabLandscapeWeightExporterLibrary::ExportLandscapeWeightLayers(
    ALandscapeProxy* Landscape,
    const FString& OutputDirectory,
    FString& OutLayoutPath,
    FString& OutError)
{
    OutLayoutPath.Reset();
    OutError.Reset();
    if (!Landscape)
    {
        OutError = TEXT("Landscape is null");
        return false;
    }

    ULandscapeInfo* LandscapeInfo = Landscape->GetLandscapeInfo();
    if (!LandscapeInfo)
    {
        OutError = FString::Printf(TEXT("%s has no registered ULandscapeInfo"), *Landscape->GetPathName());
        return false;
    }

    FIntRect Extent;
    if (!LandscapeInfo->GetLandscapeExtent(Extent))
    {
        OutError = TEXT("ULandscapeInfo::GetLandscapeExtent failed");
        return false;
    }
    const int32 Width = Extent.Width() + 1;
    const int32 Height = Extent.Height() + 1;
    if (Width <= 0 || Height <= 0)
    {
        OutError = FString::Printf(TEXT("Invalid Landscape extent %dx%d"), Width, Height);
        return false;
    }

    const FString AbsoluteOutput = FPaths::ConvertRelativePathToFull(OutputDirectory);
    IFileManager::Get().MakeDirectory(*AbsoluteOutput, true);
    const FString RawDirectory = FPaths::Combine(AbsoluteOutput, TEXT("raw"));
    IFileManager::Get().MakeDirectory(*RawDirectory, true);

    TArray<ULandscapeLayerInfoObject*> UsedLayers;
    LandscapeInfo->GetUsedPaintLayers(FGuid(), UsedLayers);
    UsedLayers.RemoveAll([](const ULandscapeLayerInfoObject* Layer) { return Layer == nullptr; });

    TMap<FName, ULandscapeLayerInfoObject*> UsedLayersByName;
    for (ULandscapeLayerInfoObject* LayerInfo : UsedLayers)
    {
        UsedLayersByName.Add(LayerInfo->GetLayerName(), LayerInfo);
    }

    TSet<FName> RequiredLayerSet;
    for (const FName LayerName : RequiredSnowPinesLayers())
    {
        RequiredLayerSet.Add(LayerName);
    }
    for (const TPair<FName, ULandscapeLayerInfoObject*>& Pair : UsedLayersByName)
    {
        if (!RequiredLayerSet.Contains(Pair.Key))
        {
            OutError = FString::Printf(
                TEXT("SnowPines has an allocated layer outside the ten-layer material contract: %s"),
                *Pair.Key.ToString());
            return false;
        }
    }

    // MI_Landscape_Snow declares ten graph inputs, but the SnowPines map only
    // allocates seven of them. The three Desert* inputs still need exact masks:
    // UE evaluates an unallocated Landscape layer as zero. Loading the supplied
    // LayerInfo assets and passing them through ExportLayer preserves that exact
    // engine behavior instead of synthesizing data in the browser.
    TArray<ULandscapeLayerInfoObject*> ExportLayers;
    for (const FName LayerName : RequiredSnowPinesLayers())
    {
        ULandscapeLayerInfoObject* LayerInfo = UsedLayersByName.FindRef(LayerName);
        if (!LayerInfo)
        {
            const FString LayerPath = FString::Printf(
                TEXT("/Game/SoStylized/Environment/Landscape/LL_%s.LL_%s"),
                *LayerName.ToString(),
                *LayerName.ToString());
            LayerInfo = LoadObject<ULandscapeLayerInfoObject>(nullptr, *LayerPath);
        }
        if (!LayerInfo || LayerInfo->GetLayerName() != LayerName)
        {
            OutError = FString::Printf(
                TEXT("Unable to resolve exact LayerInfo asset for %s"),
                *LayerName.ToString());
            return false;
        }
        ExportLayers.Add(LayerInfo);
    }

    TMap<ULandscapeLayerInfoObject*, int32> AllocationCounts;
    TArray<TSharedPtr<FJsonValue>> ComponentValues;
    TMap<FString, TSharedPtr<FJsonObject>> PackedTexturesByPath;
    int32 ComponentCount = 0;
    LandscapeInfo->ForAllLandscapeComponents([&](ULandscapeComponent* Component)
    {
        if (!Component)
        {
            return;
        }
        ++ComponentCount;
        const TArray<FWeightmapLayerAllocationInfo>& Allocations =
            Component->GetWeightmapLayerAllocations(false);
        const TArray<UTexture2D*>& Textures = Component->GetWeightmapTextures(false);

        TArray<TSharedPtr<FJsonValue>> AllocationValues;
        for (const FWeightmapLayerAllocationInfo& Allocation : Allocations)
        {
            if (!Allocation.IsAllocated() || !Allocation.LayerInfo)
            {
                continue;
            }
            AllocationCounts.FindOrAdd(Allocation.LayerInfo) += 1;
            TSharedPtr<FJsonObject> AllocationJson = MakeShared<FJsonObject>();
            AllocationJson->SetStringField(
                TEXT("layer"),
                Allocation.LayerInfo->GetLayerName().ToString());
            AllocationJson->SetStringField(TEXT("layerInfo"), ObjectPath(Allocation.LayerInfo));
            AllocationJson->SetNumberField(TEXT("textureIndex"), Allocation.WeightmapTextureIndex);
            AllocationJson->SetNumberField(TEXT("channel"), Allocation.WeightmapTextureChannel);
            AllocationJson->SetStringField(
                TEXT("channelName"),
                FString::Chr(TEXT("RGBA")[Allocation.WeightmapTextureChannel]));
            if (Textures.IsValidIndex(Allocation.WeightmapTextureIndex))
            {
                UTexture2D* Texture = Textures[Allocation.WeightmapTextureIndex];
                const FString TexturePath = ObjectPath(Texture);
                AllocationJson->SetStringField(TEXT("texture"), TexturePath);
                if (Texture && !PackedTexturesByPath.Contains(TexturePath))
                {
                    TSharedPtr<FJsonObject> TextureJson = MakeShared<FJsonObject>();
                    TextureJson->SetStringField(TEXT("path"), TexturePath);
                    TextureJson->SetNumberField(TEXT("width"), Texture->Source.GetSizeX());
                    TextureJson->SetNumberField(TEXT("height"), Texture->Source.GetSizeY());
                    TextureJson->SetBoolField(TEXT("srgb"), Texture->SRGB);
                    PackedTexturesByPath.Add(TexturePath, TextureJson);
                }
            }
            AllocationValues.Add(MakeShared<FJsonValueObject>(AllocationJson));
        }

        TSharedPtr<FJsonObject> ComponentJson = MakeShared<FJsonObject>();
        ComponentJson->SetStringField(TEXT("name"), Component->GetName());
        ComponentJson->SetStringField(TEXT("path"), Component->GetPathName());
        const FIntPoint SectionBase = Component->GetSectionBase();
        ComponentJson->SetArrayField(TEXT("sectionBase"), {
            MakeShared<FJsonValueNumber>(SectionBase.X),
            MakeShared<FJsonValueNumber>(SectionBase.Y),
        });
        ComponentJson->SetNumberField(TEXT("componentSizeQuads"), Component->ComponentSizeQuads);
        ComponentJson->SetNumberField(TEXT("subsectionSizeQuads"), Component->SubsectionSizeQuads);
        ComponentJson->SetNumberField(TEXT("numSubsections"), Component->NumSubsections);
        ComponentJson->SetArrayField(TEXT("allocations"), MoveTemp(AllocationValues));
        ComponentValues.Add(MakeShared<FJsonValueObject>(ComponentJson));
    });

    TArray<TSharedPtr<FJsonValue>> LayerValues;
    for (int32 LayerIndex = 0; LayerIndex < ExportLayers.Num(); ++LayerIndex)
    {
        ULandscapeLayerInfoObject* LayerInfo = ExportLayers[LayerIndex];
        const FString LayerName = LayerInfo->GetLayerName().ToString();
        const FString Filename = FString::Printf(
            TEXT("%02d-%s.r8"),
            LayerIndex + 1,
            *FPaths::MakeValidFileName(LayerName));
        const FString RawPath = FPaths::Combine(RawDirectory, Filename);

        // This is the UE 5.8 editor path used by Landscape mode itself. It
        // fills a uint8 array with FLandscapeEditDataInterface::GetWeightDataFast
        // and the .r8 writer stores those bytes without conversion.
        LandscapeInfo->ExportLayer(LayerInfo, RawPath);
        const int64 FileSize = IFileManager::Get().FileSize(*RawPath);
        if (FileSize != static_cast<int64>(Width) * Height)
        {
            OutError = FString::Printf(
                TEXT("Layer %s exported %lld bytes; expected %d"),
                *LayerName,
                FileSize,
                Width * Height);
            return false;
        }

        TSharedPtr<FJsonObject> LayerJson = MakeShared<FJsonObject>();
        LayerJson->SetStringField(TEXT("name"), LayerName);
        LayerJson->SetStringField(TEXT("layerInfo"), ObjectPath(LayerInfo));
        LayerJson->SetStringField(TEXT("blendMethod"), BlendMethodName(LayerInfo->GetBlendMethod()));
        LayerJson->SetStringField(TEXT("blendGroup"), LayerInfo->GetBlendGroup().ToString());
        LayerJson->SetStringField(TEXT("rawFile"), FPaths::Combine(TEXT("raw"), Filename));
        LayerJson->SetNumberField(TEXT("allocations"), AllocationCounts.FindRef(LayerInfo));
        LayerJson->SetBoolField(TEXT("sourceAllocated"), UsedLayersByName.Contains(LayerInfo->GetLayerName()));
        LayerValues.Add(MakeShared<FJsonValueObject>(LayerJson));
    }

    TArray<FString> TexturePaths;
    PackedTexturesByPath.GetKeys(TexturePaths);
    TexturePaths.Sort();
    TArray<TSharedPtr<FJsonValue>> PackedTextureValues;
    for (const FString& TexturePath : TexturePaths)
    {
        PackedTextureValues.Add(MakeShared<FJsonValueObject>(PackedTexturesByPath[TexturePath]));
    }

    TSharedPtr<FJsonObject> Root = MakeShared<FJsonObject>();
    Root->SetStringField(TEXT("schema"), TEXT("toonlab.ue58-landscape-weight-export"));
    Root->SetNumberField(TEXT("version"), 1);
    Root->SetStringField(TEXT("engineVersion"), FEngineVersion::Current().ToString());
    Root->SetStringField(TEXT("landscape"), Landscape->GetPathName());
    Root->SetObjectField(TEXT("extent"), [&]()
    {
        TSharedPtr<FJsonObject> Json = MakeShared<FJsonObject>();
        Json->SetNumberField(TEXT("minX"), Extent.Min.X);
        Json->SetNumberField(TEXT("minY"), Extent.Min.Y);
        Json->SetNumberField(TEXT("maxX"), Extent.Max.X);
        Json->SetNumberField(TEXT("maxY"), Extent.Max.Y);
        Json->SetNumberField(TEXT("width"), Width);
        Json->SetNumberField(TEXT("height"), Height);
        return Json;
    }());
    Root->SetObjectField(TEXT("counts"), [&]()
    {
        TSharedPtr<FJsonObject> Json = MakeShared<FJsonObject>();
        Json->SetNumberField(TEXT("components"), ComponentCount);
        Json->SetNumberField(TEXT("paintedLayers"), UsedLayers.Num());
        Json->SetNumberField(TEXT("exportedLayers"), ExportLayers.Num());
        Json->SetNumberField(TEXT("materialGraphLayers"), RequiredSnowPinesLayers().Num());
        Json->SetNumberField(TEXT("packedTextures"), PackedTextureValues.Num());
        return Json;
    }());
    Root->SetArrayField(TEXT("layers"), MoveTemp(LayerValues));
    Root->SetArrayField(TEXT("packedTextures"), MoveTemp(PackedTextureValues));
    Root->SetArrayField(TEXT("components"), MoveTemp(ComponentValues));
    Root->SetObjectField(TEXT("sourceReadMethod"), [&]()
    {
        TSharedPtr<FJsonObject> Json = MakeShared<FJsonObject>();
        Json->SetStringField(
            TEXT("api"),
            TEXT("ULandscapeInfo::ExportLayer -> FLandscapeEditDataInterface::GetWeightDataFast"));
        Json->SetStringField(TEXT("format"), TEXT("FLandscapeWeightmapFileFormat_Raw (.r8)"));
        Json->SetStringField(TEXT("data"), TEXT("final merged Landscape edit-layer result"));
        Json->SetBoolField(TEXT("deprecatedRenderTargetApiUsed"), false);
        return Json;
    }());

    FString JsonText;
    const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&JsonText);
    if (!FJsonSerializer::Serialize(Root.ToSharedRef(), Writer))
    {
        OutError = TEXT("Unable to serialize layout JSON");
        return false;
    }
    OutLayoutPath = FPaths::Combine(AbsoluteOutput, TEXT("layout.json"));
    if (!FFileHelper::SaveStringToFile(JsonText + LINE_TERMINATOR, *OutLayoutPath))
    {
        OutError = FString::Printf(TEXT("Unable to write %s"), *OutLayoutPath);
        OutLayoutPath.Reset();
        return false;
    }
    return true;
}
