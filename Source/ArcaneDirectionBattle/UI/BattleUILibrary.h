#pragma once

#include "CoreMinimal.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "BattleUILibrary.generated.h"

UCLASS()
class ARCANEDIRECTIONBATTLE_API UBattleUILibrary : public UBlueprintFunctionLibrary
{
    GENERATED_BODY()

public:
    UFUNCTION(BlueprintPure, Category = "Battle UI")
    static float GetBarPercent(float CurrentValue, float MaxValue);

    UFUNCTION(BlueprintPure, Category = "Battle UI")
    static FText BuildReadoutLine(const FText& Subject, const FText& Trend);
};
