#include "Effects/SpellProjectile.h"
#include "NiagaraComponent.h"
#include "NiagaraFunctionLibrary.h"

ASpellProjectile::ASpellProjectile()
{
    PrimaryActorTick.bCanEverTick = false;

    SceneRoot = CreateDefaultSubobject<USceneComponent>(TEXT("SceneRoot"));
    RootComponent = SceneRoot;

    NiagaraComponent = CreateDefaultSubobject<UNiagaraComponent>(TEXT("SpellVfx"));
    NiagaraComponent->SetupAttachment(RootComponent);
}

void ASpellProjectile::BeginPlay()
{
    Super::BeginPlay();

    if (SpellEffect)
    {
        NiagaraComponent->SetAsset(SpellEffect);
        NiagaraComponent->Activate(true);
    }
}
