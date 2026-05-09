#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Core/EMagicType.h"
#include "SpellProjectile.generated.h"

class UNiagaraComponent;
class UNiagaraSystem;

UCLASS()
class ARCANEDIRECTIONBATTLE_API ASpellProjectile : public AActor
{
    GENERATED_BODY()

public:
    ASpellProjectile();

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Spell", meta = (ClampMin = "0.0"))
    float Damage = 10.0f;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Spell")
    EMagicType MagicType = EMagicType::Fire;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Spell")
    TObjectPtr<UNiagaraSystem> SpellEffect;

protected:
    virtual void BeginPlay() override;

private:
    UPROPERTY(VisibleAnywhere, Category = "Spell")
    TObjectPtr<USceneComponent> SceneRoot;

    UPROPERTY(VisibleAnywhere, Category = "Spell")
    TObjectPtr<UNiagaraComponent> NiagaraComponent;
};
