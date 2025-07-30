// Action and rank definitions for the dice roller backend
// This file contains secure server-side definitions that cannot be tampered with by clients

const RANK_BONUSES = {
  E: 0,
  D: 10,
  C: 20,
  B: 30,
  A: 40,
  S: 50
};

const ACTIONS = [
  // Basic Actions
  {
    category: 'Basic',
    name: 'Attack',
    type: 'Roll',
    subtype: 'Damage',
    description: 'Basic attack roll',
    rollFormula: '1d100 + MR + WR + other bonuses',
    calculableFormula: {
      dice: [{ count: 1, sides: 100 }],
      bonuses: ['MR', 'WR'],
      modifiers: []
    }
  },
  {
    category: 'Basic',
    name: 'Recover',
    type: 'Roll',
    subtype: 'Heal',
    description: 'Recover your HP by 1d20 with advantage and gain the same amount to any roll next cycle.\nAdded as of 6/21/25',
    rollFormula: '1d20 with advantage',
    calculableFormula: {
      dice: [{ count: 2, sides: 20, keepHighest: 1 }], // advantage = roll twice, keep highest
      bonuses: [],
      modifiers: []
    }
  },

  // Defense Actions
  {
    category: 'Defense',
    name: 'Protect',
    type: 'Roll',
    subtype: 'Damage',
    description: 'You may now protect yourself, but it only applies to the damage dealt by the enemy you attack. If AoE or Torment AoE is used, protect works against the most damaging attack among your targets.',
    rollFormula: '1d100 + MR + WR + other bonuses',
    calculableFormula: {
      dice: [{ count: 1, sides: 100 }],
      bonuses: ['MR', 'WR'],
      modifiers: []
    }
  },
  {
    category: 'Defense',
    name: 'Ultra Protect',
    type: 'Roll',
    subtype: 'Damage',
    description: 'Protect 3 allies within range and gain Vulnerability. Cannot protect self.',
    rollFormula: '1d100 + MR + WR + other bonuses',
    calculableFormula: {
      dice: [{ count: 1, sides: 100 }],
      bonuses: ['MR', 'WR'],
      modifiers: []
    }
  },
  {
    category: 'Defense',
    name: 'Counter',
    type: 'Roll',
    subtype: 'Damage',
    description: 'Distribute 10 (D), 15 (C), 20 (B), 25 (A), 30 (S) mitigation between up to 3 targets in multiples of 5s.',
    rollFormula: '1d100 + MR + WR + other bonuses',
    calculableFormula: {
      dice: [{ count: 1, sides: 100 }],
      bonuses: ['MR', 'WR'],
      modifiers: []
    }
  },
  {
    category: 'Defense',
    name: 'Ultra Counter',
    type: 'Roll',
    subtype: 'Damage',
    description: 'Gain Vulnerability. If you are adjacent to or on the space as your attack target, gain +30.\nIf successful, +30 (D), +40 (B), +50 (S) extra damage and negate Vulnerability. Max: +80.\nSucceed on: 30+',
    rollFormula: '1d100 + [30*] + [x] + MR + WR + other bonuses',
    calculableFormula: {
      dice: [{ count: 1, sides: 100 }],
      bonuses: ['MR', 'WR'],
      modifiers: [
        { type: 'conditional', condition: 'adjacent', value: 30 },
        { type: 'success_bonus', threshold: 30, bonusByRank: { D: 30, C: 30, B: 40, A: 40, S: 50 } }
      ]
    }
  },

  // Offense Actions
  {
    category: 'Offense',
    name: 'Stable Attack',
    type: 'Roll',
    subtype: 'Damage',
    description: 'Note: Upped the base slightly.',
    rollFormula: '7d20 + (1d20 per MR) + WR + other bonuses, EXP on 17-20 (20% explosion)',
    calculableFormula: {
      dice: [
        { count: 7, sides: 20 },
        { count: 'MR_LEVEL', sides: 20 } // MR_LEVEL = 0-5 based on rank
      ],
      bonuses: ['WR'],
      modifiers: [
        { type: 'explosion', threshold: 17, chance: 0.2, extraDice: { count: 1, sides: 20 } }
      ]
    }
  },
  {
    category: 'Offense',
    name: 'Special Burst Attack',
    type: 'Roll',
    subtype: 'Damage',
    description: '(B) Upgrade. Base 12d20 → 13d20\n(S) Upgrade. Base 13d20 → 14d20\nNote: As of 8:35 AM MST, this has changed. Dropped the passive and instead increased explosion chance.',
    rollFormula: '12d20 + (1d20 per MR) + WR + other bonuses, EXP on 16-20 (25% explosion)',
    calculableFormula: {
      dice: [
        { count: 'BASE_BY_RANK', sides: 20, baseDiceByRank: { E: 12, D: 12, C: 12, B: 13, A: 13, S: 14 } },
        { count: 'MR_LEVEL', sides: 20 }
      ],
      bonuses: ['WR'],
      modifiers: [
        { type: 'explosion', threshold: 16, chance: 0.25, extraDice: { count: 1, sides: 20 } }
      ]
    }
  },
  {
    category: 'Offense',
    name: 'Sneak Attack',
    type: 'Roll',
    subtype: 'Damage',
    description: 'If successful, +20 (D) +25 (C) +30 (B) +35 (A) +40 (S) extra damage, otherwise +10.\nSucceed on: 30+',
    rollFormula: '1d100 + [*] + MR + WR + other bonuses',
    calculableFormula: {
      dice: [{ count: 1, sides: 100 }],
      bonuses: ['MR', 'WR'],
      modifiers: [
        { 
          type: 'success_bonus', 
          threshold: 30, 
          successBonusByRank: { E: 20, D: 20, C: 25, B: 30, A: 35, S: 40 },
          failureBonus: 10
        }
      ]
    }
  },
  {
    category: 'Offense',
    name: 'Special Critical Attack',
    type: 'Roll',
    subtype: 'Damage',
    description: 'Passive: Multiply your total damage by 1.2\nIf 85+ multiply your total damage by 1.5 D, 1.6 C, 1.7 B, 1.8 A, 2 S.\nIf 100. multiply your total damage by 3.',
    rollFormula: '2d100 + (MR) + (WR) + other bonuses',
    calculableFormula: {
      dice: [{ count: 2, sides: 100 }],
      bonuses: ['MR', 'WR'],
      modifiers: [
        { type: 'multiplier', baseMultiplier: 1.2 },
        { 
          type: 'threshold_multiplier', 
          threshold: 85, 
          multiplierByRank: { E: 1.5, D: 1.5, C: 1.6, B: 1.7, A: 1.8, S: 2.0 }
        },
        { type: 'threshold_multiplier', threshold: 100, multiplier: 3.0 }
      ]
    }
  },
  {
    category: 'Offense',
    name: 'Sharp Attack',
    type: 'Roll',
    subtype: 'Damage',
    description: 'Free Action. Convert other bonuses into more dice that may trigger crits. +1d100 for each 40 you spend. Leftovers are added as mod.',
    rollFormula: '2d100kh1 + MR + WR + other bonuses',
    calculableFormula: {
      dice: [{ count: 2, sides: 100, keepHighest: 1 }],
      bonuses: ['MR', 'WR'],
      modifiers: [
        { type: 'bonus_conversion', conversionRate: 40, convertToDice: { count: 1, sides: 100 } }
      ]
    }
  },
  {
    category: 'Offense',
    name: 'Special Reckless Attack',
    type: 'Roll',
    subtype: 'Damage',
    description: 'Free Action. Convert other bonuses into more dice that may trigger crits. +1d100 for each 40 you spend. Leftovers are added as mod.',
    rollFormula: 'E, D, C: 1d200 + 1d100 + MR + WR + other bonuses\nB, A, S: 1d200 + 1d100 + 1d100 + MR + WR + other bonuses',
    calculableFormula: {
      dice: [
        { count: 1, sides: 200 },
        { count: 'DICE_BY_RANK', sides: 100, diceByRank: { E: 1, D: 1, C: 1, B: 2, A: 2, S: 2 } }
      ],
      bonuses: ['MR', 'WR'],
      modifiers: [
        { type: 'bonus_conversion', conversionRate: 40, convertToDice: { count: 1, sides: 100 } }
      ]
    }
  },

  // Support Actions
  {
    category: 'Support',
    name: 'Heal',
    type: 'Roll',
    subtype: 'Heal',
    description: 'Explosion: 17-20 grants you another d20 (20% explosion)\nCleanse: 1 curable condition',
    rollFormula: '2d20 + MR + WR + other bonuses then divide by 3 if AoE',
    calculableFormula: {
      dice: [{ count: 2, sides: 20 }],
      bonuses: ['MR', 'WR'],
      modifiers: [
        { type: 'explosion', threshold: 17, chance: 0.2, extraDice: { count: 1, sides: 20 } },
        { type: 'aoe_divisor', divisor: 3 }
      ]
    }
  },
  {
    category: 'Support',
    name: 'Power Heal',
    type: 'Roll',
    subtype: 'Heal',
    description: 'Explosion: 15-20 grants you another d20 (30% explosion)\nCleanse 2 curable conditions (D) 3 (B) 4 (S) after healing. +5 HP per unused cleanse charge.\nNote: Reduced base roll, but giving it a 30% chance for explosion.',
    rollFormula: '4d20 + MR + WR + other bonuses then divide by 3 if AoE',
    calculableFormula: {
      dice: [{ count: 4, sides: 20 }],
      bonuses: ['MR', 'WR'],
      modifiers: [
        { type: 'explosion', threshold: 15, chance: 0.3, extraDice: { count: 1, sides: 20 } },
        { type: 'aoe_divisor', divisor: 3 }
      ]
    }
  },
  {
    category: 'Support',
    name: 'Buff',
    type: 'Roll',
    subtype: 'Bonus',
    description: 'Three stacks on one target or one stack on three targets. Unapplied stacks are lost.',
    rollFormula: '1d100 + MR + WR + other bonuses then divide by 3',
    calculableFormula: {
      dice: [{ count: 1, sides: 100 }],
      bonuses: ['MR', 'WR'],
      modifiers: [
        { type: 'divisor', divisor: 3 }
      ]
    }
  },
  {
    category: 'Support',
    name: 'Power Buff',
    type: 'Roll',
    subtype: 'Bonus',
    description: 'Three stacks on one target or one stack on three targets. Unapplied stacks are lost.',
    rollFormula: '2d100 + MR + WR + other bonuses then divide by 3',
    calculableFormula: {
      dice: [{ count: 2, sides: 100 }],
      bonuses: ['MR', 'WR'],
      modifiers: [
        { type: 'divisor', divisor: 3 }
      ]
    }
  }
];

const ACTION_CATEGORIES = ['Basic', 'Defense', 'Offense', 'Support'];

// Helper function to get rank level as number (0-5)
function getRankLevel(rank) {
  const levels = { E: 0, D: 1, C: 2, B: 3, A: 4, S: 5 };
  return levels[rank] || 0;
}

module.exports = {
  ACTIONS,
  ACTION_CATEGORIES,
  RANK_BONUSES,
  getRankLevel
};