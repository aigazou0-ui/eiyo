#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "CombatManager.generated.h"

class AMageCharacter;

UCLASS()
class ARCANEDIRECTIONBATTLE_API ACombatManager : public AActor
{
    GENERATED_BODY()

public:
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Combat", meta = (ClampMin = "0.0"))
    float BaseDamage = 10.0f;

    UFUNCTION(BlueprintCallable, Category = "Combat")
    bool ResolveBattle(AMageCharacter* Attacker, AMageCharacter* Defender);
};
