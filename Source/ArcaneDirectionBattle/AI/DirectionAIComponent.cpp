#include "AI/DirectionAIComponent.h"

void UDirectionAIComponent::RecordDirection(EDirection Direction)
{
    PlayerHistory.Add(Direction);
}

EDirection UDirectionAIComponent::PredictNextDirection() const
{
    int32 UpCount = 0;
    int32 DownCount = 0;
    int32 LeftCount = 0;
    int32 RightCount = 0;

    for (const EDirection Dir : PlayerHistory)
    {
        switch (Dir)
        {
        case EDirection::Up:
            ++UpCount;
            break;
        case EDirection::Down:
            ++DownCount;
            break;
        case EDirection::Left:
            ++LeftCount;
            break;
        case EDirection::Right:
            ++RightCount;
            break;
        }
    }

    const int32 MaxCount = FMath::Max(FMath::Max(UpCount, DownCount), FMath::Max(LeftCount, RightCount));

    if (MaxCount == UpCount)
    {
        return EDirection::Up;
    }

    if (MaxCount == DownCount)
    {
        return EDirection::Down;
    }

    if (MaxCount == LeftCount)
    {
        return EDirection::Left;
    }

    return EDirection::Right;
}
