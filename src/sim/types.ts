export type Faction = 'human' | 'zombie';
export type State = 'patrol' | 'pursue' | 'search' | 'regroup' | 'retreat' | 'attack' | 'hold' | 'turning' | 'dead';
export interface Vec2 { x: number; z: number }
export interface Obstacle extends Vec2 { w: number; d: number; height: number; kind: 'building' | 'car' | 'dumpster' | 'fountain'; variant: number; angle: number }
export interface World { size: number; seed: number; obstacles: Obstacle[]; patrol: Vec2[] }
export interface Agent extends Vec2 {
  id: number; name: string; faction: Faction; state: State; hp: number;
  heading: number; target: number | null; lastKnown: Vec2 | null; memoryUntil: number;
  path: Vec2[]; destination: Vec2 | null; nextThink: number; nextPath: number;
  cooldown: number; strikeAt: number; attackStarted: number; attackTarget: number | null;
  turnAt: number; stateSince: number; retreatUntil: number; braveUntil: number;
  hitAt: number; deathAt: number; patrolIndex: number; distance: number; moving: boolean;
  stuckFor: number; recoveryUntil: number;
}
export type Outcome = 'humans' | 'zombies' | 'draw';
export interface SimEvent { type: 'attack' | 'hit' | 'conversion' | 'death' | 'complete'; time: number; actor: number; target?: number; outcome?: Outcome }
export interface Counts { humans: number; zombies: number; turning: number; dead: number; conversions: number }
export const MOVEMENT_SPEED_MULTIPLIER = 4;
export const RULES = {
  step: 1 / 20, humanSight: 29, scent: 70, melee: 1.9,
  humanHP: 100, zombieHP: 100, humanDamage: 35, zombieDamage: 16,
  humanCooldown: 3.2, zombieCooldown: 3.8, windup: 0.48,
  humanSpeed: 0.84 * MOVEMENT_SPEED_MULTIPLIER, zombieSpeed: 0.61 * MOVEMENT_SPEED_MULTIPLIER, retreatSpeed: 1.05 * MOVEMENT_SPEED_MULTIPLIER,
  conversionSeconds: 4, memorySeconds: 9,
} as const;
