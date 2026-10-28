/**
 * Declarative workspace modules. This file is client-safe: no database or node imports.
 * A module is one registry page backed by mb_module_records, with validated fields, an explicit
 * state machine and (server-side, see engine.ts) domain effects and guards.
 */
export type RefKind = 'customer' | 'product' | 'invoice' | `module:${string}`;
export type FieldKind = 'text' | 'longtext' | 'int' | 'money' | 'bps' | 'date' | 'enum' | 'bool' | 'email' | 'url' | 'code' | 'ref' | 'lines';
export type FieldDef = {
  name: string; label: string; kind: FieldKind; required?: boolean;
  options?: readonly string[]; ref?: RefKind; min?: number; max?: number; help?: string;
  /** Hidden from the create form; set by effects. */
  system?: boolean;
};
/** to: 'same' keeps the current state (a recorded check such as a test run). */
export type TransitionDef = { label: string; from: readonly string[]; to: string; inputs?: FieldDef[]; danger?: boolean };
export type ModuleDef = {
  id: string; pillar?: number; menuId: string; title: string; noun: string; summary: string;
  fields: FieldDef[]; initial: string; states: readonly string[];
  /** States in which the record fields may still be edited. */
  editableIn: readonly string[];
  transitions: Record<string, TransitionDef>;
  /** Fields shown as columns in the list (defaults to the first three). */
  columns?: string[];
  /** Provider-dependent page: local records work; the provider action needs credentials (status needs-credentials). */
  provider?: ProviderSpec;
  /** Role permission a signed-in member needs to create/update/transition (checked in the API route). */
  writePermission?: 'members.manage' | 'expense.submit' | 'expense.decide' | 'finance.read' | 'finance.write' | 'memory.company' | 'jev.decide' | 'deals.write';
  /** Honest limits shown on the page. */
  limits: string[];
};
export type ModuleRecord = { id: string; module: string; status: string; data: Record<string, unknown>; version: number; createdAt: string; updatedAt: string; computed?: Record<string, string> };
export type RefOption = { id: string; label: string };
export type ModuleView = { def: ModuleDef; records: ModuleRecord[]; refs: Record<string, RefOption[]>; stats: { label: string; value: string }[]; loadedAt: string };
export const formatMoney = (paise: number) => `INR ${(paise / 100).toFixed(2)}`;
export type TesterKind = 'meta-graph' | 'razorpay' | 'cloudflare' | 'openrouter' | 'meta-model' | 'smtp' | 'http' | 'none';
export type ProviderSpec = { name: string; tester: TesterKind; secrets: { key: string; label: string; ref: string }[]; note?: string };
/** Reported for a queued outbox item: never "sent". */
export const QUEUED_LABEL = 'queued, provider not connected';
