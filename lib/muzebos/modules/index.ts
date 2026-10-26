import type { ModuleDef } from './types';
import { ORDERS_STOCK_MODULES } from './catalog-orders-stock';
import { MONEY_MODULES } from './catalog-money';
import { OPS_FOUNDATION_MODULES } from './catalog-ops-foundation';
export * from './types';
export const MODULES: ModuleDef[] = [...ORDERS_STOCK_MODULES, ...MONEY_MODULES, ...OPS_FOUNDATION_MODULES];
export const moduleById = (id: string) => MODULES.find((m) => m.id === id);
