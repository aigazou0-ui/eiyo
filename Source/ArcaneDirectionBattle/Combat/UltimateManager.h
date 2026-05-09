#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "UltimateManager.generated.h"

UCLASS(ClassGroup = (Custom), meta = (BlueprintSpawnableComponent))
class ARCANEDIRECTIONBATTLE_API UUltimateManager : public UActorComponent
{
    GENERATED_BODY()

public:
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Ultimate", meta = (ClampMin = "0.0", ClampMax = "100.0"))
    float UltimateGauge = 0.0f;

    UFUNCTION(BlueprintCallable, Category = "Ultimate")
    bool CanUseUltimate() const;
};
