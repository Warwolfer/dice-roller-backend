// Formula calculator for action rolls with proper dice mechanics and bonuses
const { RANK_BONUSES, getRankLevel } = require('./actions');

class FormulaCalculator {
  constructor() {
    // Removed rollHistory - use database for audit trail instead
  }

  /**
   * Roll a single die
   */
  rollDie(sides) {
    return Math.floor(Math.random() * sides) + 1;
  }

  /**
   * Roll multiple dice and apply keep highest/lowest if specified
   */
  rollDice(diceConfig) {
    const { count, sides, keepHighest, keepLowest } = diceConfig;
    const actualCount = typeof count === 'string' ? this.resolveCountVariable(count) : count;
    
    if (actualCount <= 0) return [];
    
    const rolls = [];
    for (let i = 0; i < actualCount; i++) {
      rolls.push(this.rollDie(sides));
    }

    if (keepHighest) {
      rolls.sort((a, b) => b - a);
      return rolls.slice(0, keepHighest);
    }
    
    if (keepLowest) {
      rolls.sort((a, b) => a - b);
      return rolls.slice(0, keepLowest);
    }

    return rolls;
  }

  /**
   * Resolve count variables like 'MR_LEVEL', 'BASE_BY_RANK', etc.
   */
  resolveCountVariable(countVar, weaponRank = 'E', masteryRank = 'E') {
    switch (countVar) {
      case 'MR_LEVEL':
        return getRankLevel(masteryRank);
      case 'WR_LEVEL':
        return getRankLevel(weaponRank);
      case 'BASE_BY_RANK':
        // This will be handled in the dice config with baseDiceByRank
        return 0;
      case 'DICE_BY_RANK':
        // This will be handled in the dice config with diceByRank
        return 0;
      default:
        return 0;
    }
  }

  /**
   * Calculate the total result for an action roll
   */
  calculateActionRoll(action, weaponRank, masteryRank, otherBonuses = 0) {
    const { calculableFormula } = action;
    this.rollHistory = [];
    
    let totalResult = 0;
    let rawDiceTotal = 0; // Track pure dice total before any bonuses
    let diceGroups = []; // Store dice groups with their individual rolls
    let bonusBreakdown = [];
    let modifierBreakdown = [];

    // Roll all dice and store detailed breakdown
    for (const diceConfig of calculableFormula.dice) {
      let count = diceConfig.count;
      
      // Handle special count variables
      if (typeof count === 'string') {
        count = this.resolveCountVariable(count, weaponRank, masteryRank);
      }
      
      // Handle rank-based dice counts
      if (diceConfig.baseDiceByRank) {
        count = diceConfig.baseDiceByRank[masteryRank] || diceConfig.baseDiceByRank.E;
      }
      
      if (diceConfig.diceByRank) {
        count = diceConfig.diceByRank[masteryRank] || diceConfig.diceByRank.E;
      }

      if (count > 0) {
        const diceRolls = this.rollDice({ ...diceConfig, count });
        const diceSum = diceRolls.reduce((sum, roll) => sum + roll, 0);
        
        // Store dice group details
        const diceGroup = {
          type: `${count}d${diceConfig.sides}`,
          rolls: diceRolls,
          sum: diceSum,
          keepHighest: diceConfig.keepHighest,
          keepLowest: diceConfig.keepLowest
        };
        
        diceGroups.push(diceGroup);
        totalResult += diceSum;
        rawDiceTotal += diceSum; // Track raw dice total
      }
    }

    // Add bonuses with detailed breakdown
    for (const bonusType of calculableFormula.bonuses) {
      if (bonusType === 'MR') {
        const bonus = RANK_BONUSES[masteryRank];
        bonusBreakdown.push({
          type: 'Mastery Rank',
          rank: masteryRank,
          value: bonus,
          display: `${masteryRank} MR`
        });
        totalResult += bonus;
      } else if (bonusType === 'WR') {
        const bonus = RANK_BONUSES[weaponRank];
        bonusBreakdown.push({
          type: 'Weapon Rank',
          rank: weaponRank,
          value: bonus,
          display: `${weaponRank} WR`
        });
        totalResult += bonus;
      }
    }

    // Add other bonuses
    if (otherBonuses > 0) {
      bonusBreakdown.push({
        type: 'Other',
        value: otherBonuses,
        display: 'Buff'
      });
      totalResult += otherBonuses;
    }

    // Apply modifiers with detailed breakdown
    let finalResult = totalResult;
    let explosionRolls = [];

    for (const modifier of calculableFormula.modifiers || []) {
      const modifierResult = this.applyModifier(modifier, finalResult, diceGroups.flatMap(g => g.rolls), weaponRank, masteryRank, otherBonuses);
      
      // Store modifier details
      if (modifierResult.value !== 0 || modifierResult.multiplier !== 1 || modifier.type === 'explosion') {
        modifierBreakdown.push({
          type: modifier.type,
          description: modifierResult.details,
          value: modifierResult.value || 0,
          multiplier: modifierResult.multiplier || 1,
          explosionRolls: modifierResult.explosionRolls || []
        });
        
        if (modifierResult.explosionRolls) {
          explosionRolls = explosionRolls.concat(modifierResult.explosionRolls);
          // Add explosion rolls to raw dice total since they're pure dice
          if (modifier.type === 'explosion') {
            rawDiceTotal += modifierResult.explosionRolls.reduce((sum, roll) => sum + roll, 0);
          }
        }
      }
      
      finalResult = modifierResult.result;
    }

    // Generate human-readable breakdown
    const breakdown = this.generateBreakdownString(diceGroups, bonusBreakdown, modifierBreakdown, explosionRolls, finalResult);

    // rollHistory removed - use database for persistent audit trail

    return {
      result: Math.max(1, Math.floor(finalResult)), // Ensure positive integer result
      rawDiceResult: rawDiceTotal, // Raw dice total before bonuses
      details: {
        diceGroups,
        bonusBreakdown,
        modifierBreakdown,
        explosionRolls,
        rawDiceTotal,
        baseTotal: totalResult,
        finalResult,
        breakdown
      }
    };
  }

  /**
   * Apply a modifier to the current result
   */
  applyModifier(modifier, currentResult, allRolls, weaponRank, masteryRank, otherBonuses) {
    switch (modifier.type) {
      case 'multiplier':
        return {
          result: currentResult * modifier.baseMultiplier,
          details: `Base multiplier ${modifier.baseMultiplier}x`,
          multiplier: modifier.baseMultiplier,
          value: 0
        };

      case 'threshold_multiplier':
        if (currentResult >= modifier.threshold) {
          const multiplier = modifier.multiplierByRank 
            ? modifier.multiplierByRank[masteryRank] || modifier.multiplierByRank.E
            : modifier.multiplier;
          return {
            result: currentResult * multiplier,
            details: `${masteryRank} Critical`,
            multiplier: multiplier,
            value: 0
          };
        }
        return {
          result: currentResult,
          details: `Threshold ${modifier.threshold} not met`,
          multiplier: 1,
          value: 0
        };

      case 'success_bonus':
        if (currentResult >= modifier.threshold) {
          const bonus = modifier.successBonusByRank 
            ? modifier.successBonusByRank[masteryRank] || modifier.successBonusByRank.E
            : modifier.bonusByRank[masteryRank] || modifier.bonusByRank.E;
          return {
            result: currentResult + bonus,
            details: `Success bonus`,
            multiplier: 1,
            value: bonus
          };
        } else if (modifier.failureBonus) {
          return {
            result: currentResult + modifier.failureBonus,
            details: `Consolation bonus`,
            multiplier: 1,
            value: modifier.failureBonus
          };
        }
        return {
          result: currentResult,
          details: `Failed threshold ${modifier.threshold}`,
          multiplier: 1,
          value: 0
        };

      case 'explosion':
        let explosions = 0;
        for (const roll of allRolls) {
          if (roll >= modifier.threshold) {
            explosions++;
          }
        }
        if (explosions > 0) {
          const allExplosionRolls = [];
          let explosionTotal = 0;
          let currentExplosions = explosions;
          let totalTriggers = explosions;
          
          // Handle cascading explosions with safety limit
          let maxIterations = 10; // Prevent infinite loops
          while (currentExplosions > 0 && maxIterations > 0) {
            const newRolls = [];
            for (let i = 0; i < currentExplosions; i++) {
              const extraRoll = this.rollDie(modifier.extraDice.sides);
              newRolls.push(extraRoll);
              allExplosionRolls.push(extraRoll);
              explosionTotal += extraRoll;
            }
            
            // Check if any of the new rolls trigger more explosions
            currentExplosions = 0;
            for (const newRoll of newRolls) {
              if (newRoll >= modifier.threshold) {
                currentExplosions++;
                totalTriggers++;
              }
            }
            maxIterations--;
          }
          
          return {
            result: currentResult + explosionTotal,
            details: `${totalTriggers} explosions`,
            multiplier: 1,
            value: explosionTotal,
            explosionRolls: allExplosionRolls
          };
        }
        return {
          result: currentResult,
          details: `No explosions`,
          multiplier: 1,
          value: 0
        };

      case 'divisor':
        return {
          result: Math.floor(currentResult / modifier.divisor),
          details: `Divided by ${modifier.divisor}`,
          multiplier: 1 / modifier.divisor,
          value: 0
        };

      case 'aoe_divisor':
        return {
          result: currentResult,
          details: `Single target`,
          multiplier: 1,
          value: 0
        };

      case 'bonus_conversion':
        const convertibleBonuses = Math.floor(otherBonuses / modifier.conversionRate);
        const extraDice = convertibleBonuses * modifier.convertToDice.count;
        const leftoverBonus = otherBonuses % modifier.conversionRate;
        
        if (extraDice > 0) {
          let extraTotal = 0;
          const conversionRolls = [];
          for (let i = 0; i < extraDice; i++) {
            const roll = this.rollDie(modifier.convertToDice.sides);
            conversionRolls.push(roll);
            extraTotal += roll;
          }
          return {
            result: currentResult - otherBonuses + extraTotal + leftoverBonus,
            details: `Converted ${extraDice} dice`,
            multiplier: 1,
            value: extraTotal + leftoverBonus - otherBonuses,
            explosionRolls: conversionRolls
          };
        }
        return {
          result: currentResult,
          details: `No conversion`,
          multiplier: 1,
          value: 0
        };

      case 'conditional':
        return {
          result: currentResult,
          details: `Conditional not met`,
          multiplier: 1,
          value: 0
        };

      default:
        return {
          result: currentResult,
          details: `Unknown modifier`,
          multiplier: 1,
          value: 0
        };
    }
  }

  /**
   * Generate human-readable breakdown string
   */
  generateBreakdownString(diceGroups, bonusBreakdown, modifierBreakdown, explosionRolls, finalResult) {
    let parts = [];

    // Add dice rolls
    for (const group of diceGroups) {
      if (group.keepHighest || group.keepLowest) {
        const keptRolls = group.keepHighest 
          ? [...group.rolls].sort((a, b) => b - a).slice(0, group.keepHighest)
          : [...group.rolls].sort((a, b) => a - b).slice(0, group.keepLowest);
        parts.push(`${group.type}[${group.rolls.join(', ')}→${keptRolls.join(', ')}]`);
      } else {
        parts.push(`${group.type}[${group.rolls.join(' + ')}]`);
      }
    }

    // Add explosions if any with explosion count
    if (explosionRolls.length > 0) {
      // Find explosion modifier to get count
      const explosionModifier = modifierBreakdown.find(m => m.type === 'explosion');
      const explosionCount = explosionModifier?.description || `${explosionRolls.length} explosions`;
      parts.push(`EXP[${explosionRolls.join(' + ')}](${explosionCount})`);
    }

    // Add bonuses
    for (const bonus of bonusBreakdown) {
      if (bonus.value > 0) {
        parts.push(`${bonus.value}(${bonus.display})`);
      }
    }

    // Build base calculation
    let baseCalc = parts.join(' + ');

    // Add modifiers (excluding explosions which are already handled above)
    let result = baseCalc;
    for (const modifier of modifierBreakdown) {
      if (modifier.multiplier && modifier.multiplier !== 1) {
        result = `(${result}) × ${modifier.multiplier}(${modifier.description})`;
      } else if (modifier.value !== 0 && modifier.type !== 'explosion') {
        // Skip explosions since they're already included with EXP[...]
        result += ` + ${modifier.value}(${modifier.description})`;
      }
    }

    return result;
  }

  /**
   * Get the last roll history for debugging
   * Note: rollHistory removed - use database queries for roll details
   */
  getLastRollHistory() {
    return null;
  }
}

module.exports = FormulaCalculator;