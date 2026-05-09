#include "Characters/MageCharacter.h"

AMageCharacter::AMageCharacter()
{
    PrimaryActorTick.bCanEverTick = true;
}

void AMageCharacter::BeginPlay()
{
    Super::BeginPlay();

    HP = FMath::Clamp(HP, 0.0f, MaxHP);
    Mana = FMath::Clamp(Mana, 0.0f, MaxMana);
}

void AMageCharacter::Tick(float DeltaTime)
{
    Super::Tick(DeltaTime);
}

void AMageCharacter::Attack(EDirection Direction, EMagicType MagicType)
{
    bIsAttacking = true;
    bIsBlocking = false;
    SelectedDirection = Direction;
    SelectedMagic = MagicType;
}

void AMageCharacter::Defend(EDirection Direction, EMagicType MagicType)
{
    bIsBlocking = true;
    bIsAttacking = false;
    SelectedDirection = Direction;
    SelectedMagic = MagicType;
}

void AMageCharacter::ReceiveDamage(float DamageAmount)
{
    HP = FMath::Clamp(HP - FMath::Max(0.0f, DamageAmount), 0.0f, MaxHP);
}

float AMageCharacter::GetHPPercent() const
{
    return MaxHP > 0.0f ? HP / MaxHP : 0.0f;
}

float AMageCharacter::GetManaPercent() const
{
    return MaxMana > 0.0f ? Mana / MaxMana : 0.0f;
}
