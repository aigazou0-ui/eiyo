#include "Combat/FeintComponent.h"

EDirection UFeintComponent::ChangeDirection(EDirection Current) const
{
    if (!bCanFeint)
    {
        return Current;
    }

    switch (Current)
    {
    case EDirection::Up:
        return EDirection::Left;
    case EDirection::Left:
        return EDirection::Right;
    case EDirection::Right:
        return EDirection::Down;
    case EDirection::Down:
    default:
        return EDirection::Up;
    }
}
