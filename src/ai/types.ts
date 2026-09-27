import type { Vec2 } from '../sim/types';
export const JEV_MAX_CONCURRENT = 4;
export type OrderKind = 'regroup' | 'retreat' | 'attack' | 'advance' | 'search' | 'hold';
export interface Order { id: string; kind: OrderKind; destination?: Vec2; target?: number }
export interface Squad { id: number; members: number[] }
export interface Sighting extends Vec2 { id: number; hp: number; seenAt: number }
export interface SquadSnapshot extends Squad { version: number; orders: Order[]; currentOrder?: Order }
export interface DecisionSnapshot {
  runId: string; tick: number; time: number; sequence: number; decisionSquadIds: number[];
  humans: { id: number; x: number; z: number; hp: number }[];
  sightings: Sighting[]; squads: SquadSnapshot[];
}
export interface Decision { squadId: number; orderId: string; confidence: number }
export interface DecisionResponse { runId: string; tick: number; decisions: Decision[]; latencyMs?: number; tokens?: number }
export interface AssignedOrder { order: Order; issuedAt: number; confidence: number }
export const membership = (squads: Squad[]) => squads.map(s => `${s.id}:${s.members.join(',')}`).join('|');
export function validResponse(value: unknown, snapshot: DecisionSnapshot): value is DecisionResponse {
  const r = value as DecisionResponse | null;
  return !!r && r.runId === snapshot.runId && r.tick === snapshot.tick && Array.isArray(r.decisions)
    && r.decisions.length === snapshot.decisionSquadIds.length && new Set(r.decisions.map(d => d?.squadId)).size === r.decisions.length
    && r.decisions.every(d => d && Number.isFinite(d.confidence) && d.confidence >= 0 && d.confidence <= 1
      && snapshot.decisionSquadIds.includes(d.squadId) && snapshot.squads.some(s => s.id === d.squadId && s.orders.some(o => o.id === d.orderId)));
}
