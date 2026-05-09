#pragma once

#include "CoreMinimal.h"
#include "EMagicType.generated.h"

UENUM(BlueprintType)
enum class EMagicType : uint8
{
    Fire UMETA(DisplayName = "Fire"),
    Ice UMETA(DisplayName = "Ice"),
    Thunder UMETA(DisplayName = "Thunder"),
    Dark UMETA(DisplayName = "Dark"),
    Light UMETA(DisplayName = "Light")
};
