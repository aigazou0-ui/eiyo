#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Core/EDirection.h"
#include "DirectionAIComponent.generated.h"

UCLASS(ClassGroup = (Custom), meta = (BlueprintSpawnableComponent))
class ARCANEDIRECTIONBATTLE_API UDirectionAIComponent : public UActorComponent
{
    GENERATED_BODY()

public:
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Direction AI")
    TArray<EDirection> PlayerHistory;

    UFUNCTION(BlueprintCallable, Category = "Direction AI")
    void RecordDirection(EDirection Direction);

    UFUNCTION(BlueprintCallable, Category = "Direction AI")
    EDirection PredictNextDirection() const;
};
