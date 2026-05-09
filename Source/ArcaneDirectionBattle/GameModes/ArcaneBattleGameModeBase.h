#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "ArcaneBattleGameModeBase.generated.h"

UCLASS()
class ARCANEDIRECTIONBATTLE_API AArcaneBattleGameModeBase : public AGameModeBase
{
    GENERATED_BODY()

public:
    AArcaneBattleGameModeBase();

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Round")
    float RoundTimeSeconds = 99.0f;

    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Round")
    int32 RoundsToWin = 2;
};
