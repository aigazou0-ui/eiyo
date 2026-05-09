#pragma once

#include "CoreMinimal.h"
#include "Core/EMagicType.h"

class ARCANEDIRECTIONBATTLE_API FElementSystem
{
public:
    static float GetElementMultiplier(EMagicType Attack, EMagicType Defense)
    {
        if (Attack == EMagicType::Fire && Defense == EMagicType::Ice)
        {
            return 1.5f;
        }

        if (Attack == EMagicType::Ice && Defense == EMagicType::Fire)
        {
            return 0.5f;
        }

        if (Attack == EMagicType::Thunder && Defense == EMagicType::Light)
        {
            return 1.25f;
        }

        if (Attack == EMagicType::Light && Defense == EMagicType::Dark)
        {
            return 1.25f;
        }

        if (Attack == EMagicType::Dark && Defense == EMagicType::Light)
        {
            return 1.25f;
        }

        return 1.0f;
    }
};
