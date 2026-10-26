import type { ModuleDef } from './types';
import { ORDERS_STOCK_MODULES } from './catalog-orders-stock';
export * from './types';
export const MODULES: ModuleDef[] = [...ORDERS_STOCK_MODULES];
export const moduleById = (id: string) => MODULES.find((m) => m.id === id);
