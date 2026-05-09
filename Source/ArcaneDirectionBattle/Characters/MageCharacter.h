#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "Core/EDirection.h"
#include "Core/EMagicType.h"
#include "MageCharacter.generated.h"

UCLASS()
class ARCANEDIRECTIONBATTLE_API AMageCharacter : public ACharacter
{
    GENERATED_BODY()

public:
    AMageCharacter();

protected:
    virtual void BeginPlay() override;

public:
    virtual void Tick(float DeltaTime) override;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Mage|Vitals", meta = (ClampMin = "0.0"))
    float MaxHP = 100.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Mage|Vitals", meta = (ClampMin = "0.0"))
    float HP = 100.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Mage|Vitals", meta = (ClampMin = "0.0"))
    float MaxMana = 100.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Mage|Vitals", meta = (ClampMin = "0.0"))
    float Mana = 100.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Mage|Combat")
    bool bIsAttacking = false;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Mage|Combat")
    bool bIsBlocking = false;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Mage|Combat")
    EDirection SelectedDirection = EDirection::Up;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Mage|Combat")
    EMagicType SelectedMagic = EMagicType::Fire;

    UFUNCTION(BlueprintCallable, Category = "Mage|Combat")
    void Attack(EDirection Direction, EMagicType MagicType);

    UFUNCTION(BlueprintCallable, Category = "Mage|Combat")
    void Defend(EDirection Direction, EMagicType MagicType);

    UFUNCTION(BlueprintCallable, Category = "Mage|Combat")
    void ReceiveDamage(float DamageAmount);

    UFUNCTION(BlueprintPure, Category = "Mage|Vitals")
    float GetHPPercent() const;

    UFUNCTION(BlueprintPure, Category = "Mage|Vitals")
    float GetManaPercent() const;
};
