#include "Combat/CombatManager.h"
#include "Characters/MageCharacter.h"
#include "Combat/ElementSystem.h"

bool ACombatManager::ResolveBattle(AMageCharacter* Attacker, AMageCharacter* Defender)
{
    if (!Attacker || !Defender)
    {
        return false;
    }

    const bool bHit = Attacker->SelectedDirection == Defender->SelectedDirection;
    if (bHit)
    {
        const float Damage = BaseDamage * FElementSystem::GetElementMultiplier(
            Attacker->SelectedMagic,
            Defender->SelectedMagic);
        Defender->ReceiveDamage(Damage);
    }

    Attacker->bIsAttacking = false;
    Defender->bIsBlocking = false;

    return bHit;
}
