#include "GameModes/ArcaneBattleGameModeBase.h"
#include "Characters/MageCharacter.h"

AArcaneBattleGameModeBase::AArcaneBattleGameModeBase()
{
    DefaultPawnClass = AMageCharacter::StaticClass();
}
