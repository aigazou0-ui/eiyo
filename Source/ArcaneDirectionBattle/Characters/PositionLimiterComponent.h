#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "PositionLimiterComponent.generated.h"

UCLASS(ClassGroup = (Custom), meta = (BlueprintSpawnableComponent))
class ARCANEDIRECTIONBATTLE_API UPositionLimiterComponent : public UActorComponent
{
    GENERATED_BODY()

public:
    UPositionLimiterComponent();

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Position Limit")
    float MinX = -1000.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Position Limit")
    float MaxX = 1000.0f;

    virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

    UFUNCTION(BlueprintCallable, Category = "Position Limit")
    void ClampPosition(AActor* Owner) const;
};
