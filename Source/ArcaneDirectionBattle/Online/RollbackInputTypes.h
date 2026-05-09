#pragma once

#include "CoreMinimal.h"
#include "Core/EDirection.h"
#include "Core/EMagicType.h"
#include "RollbackInputTypes.generated.h"

USTRUCT(BlueprintType)
struct ARCANEDIRECTIONBATTLE_API FDirectionBattleInputFrame
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Rollback")
    int32 FrameNumber = 0;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Rollback")
    EDirection Direction = EDirection::Up;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Rollback")
    EMagicType MagicType = EMagicType::Fire;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Rollback")
    bool bWantsAttack = false;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Rollback")
    bool bWantsDefend = false;
};
