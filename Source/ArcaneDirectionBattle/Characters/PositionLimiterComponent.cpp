#include "Characters/PositionLimiterComponent.h"

UPositionLimiterComponent::UPositionLimiterComponent()
{
    PrimaryComponentTick.bCanEverTick = true;
}

void UPositionLimiterComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
    Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
    ClampPosition(GetOwner());
}

void UPositionLimiterComponent::ClampPosition(AActor* Owner) const
{
    if (!Owner)
    {
        return;
    }

    FVector Position = Owner->GetActorLocation();
    Position.X = FMath::Clamp(Position.X, MinX, MaxX);
    Owner->SetActorLocation(Position);
}
