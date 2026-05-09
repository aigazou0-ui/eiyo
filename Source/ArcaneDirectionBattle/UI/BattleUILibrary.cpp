#include "UI/BattleUILibrary.h"

float UBattleUILibrary::GetBarPercent(float CurrentValue, float MaxValue)
{
    return MaxValue > 0.0f ? FMath::Clamp(CurrentValue / MaxValue, 0.0f, 1.0f) : 0.0f;
}

FText UBattleUILibrary::BuildReadoutLine(const FText& Subject, const FText& Trend)
{
    return FText::Format(NSLOCTEXT("ArcaneDirectionBattle", "ReadoutLine", "{0}: {1}"), Subject, Trend);
}
