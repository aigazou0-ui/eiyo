#pragma once

#include "CoreMinimal.h"
#include "EDirection.generated.h"

UENUM(BlueprintType)
enum class EDirection : uint8
{
    Up UMETA(DisplayName = "Up"),
    Down UMETA(DisplayName = "Down"),
    Left UMETA(DisplayName = "Left"),
    Right UMETA(DisplayName = "Right")
};
