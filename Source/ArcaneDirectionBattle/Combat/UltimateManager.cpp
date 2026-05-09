#include "Combat/UltimateManager.h"

bool UUltimateManager::CanUseUltimate() const
{
    return UltimateGauge >= 100.0f;
}
