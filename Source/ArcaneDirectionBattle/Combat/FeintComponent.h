#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Core/EDirection.h"
#include "FeintComponent.generated.h"

UCLASS(ClassGroup = (Custom), meta = (BlueprintSpawnableComponent))
class ARCANEDIRECTIONBATTLE_API UFeintComponent : public UActorComponent
{
    GENERATED_BODY()

public:
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Feint")
    bool bCanFeint = true;

    UFUNCTION(BlueprintCallable, Category = "Feint")
    EDirection ChangeDirection(EDirection Current) const;
};
