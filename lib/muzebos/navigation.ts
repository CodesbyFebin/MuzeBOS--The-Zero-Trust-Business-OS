import { Home, ShoppingCart, Wallet, MessagesSquare, Package, TrendingUp, Users, PanelsTopLeft, Brain, Landmark, Server, Workflow, ShieldCheck, Settings, CreditCard, CircleHelp, Code2, UserCircle, type LucideIcon } from 'lucide-react';

export type WorkspaceCategory = { id:string; code:string; label:string; title:string; cadence:'Daily'|'Weekly'|'Setup'; first:number; icon:LucideIcon; summary:string; names:string[]; };
export const WORKSPACE_CATEGORIES:WorkspaceCategory[]=[
 {id:'orders',code:'ORD',label:'Orders & CRM',title:'Commerce, Orders & CRM',cadence:'Daily',first:1,icon:ShoppingCart,summary:'Sell, book, serve customers and close deals.',names:'Orders Pipeline|POS Terminal|Bookings & Appointments|CRM Profiles|Deals & Pipeline|Cart Abandonment|Returns & Refunds|Subscription Scheduler|Gift Cards & Credits|Customer Self-Service Portal|B2B Quote CPQ|Lead Enrichment|Interaction Scoring|Omnichannel Router|Pre-Order & Waitlist|POI Location Directory|Wholesale Contract Ledger|Attribution Mapper|Risk Pre-Screen|Tax Jurisdiction Matrix'.split('|')},
 {id:'money',code:'FIN',label:'Money & Billing',title:'Billing, UPI & Money',cadence:'Daily',first:21,icon:Wallet,summary:'Issue invoices, inspect payment requests and reconcile money.',names:'Invoice Maker|GST Billing Engine|Open UPI Gateway|Payments & Settlements|Pricing & Discounts|Payment Link Generator|Multi-Currency Converter|Splitter & Escrow|Deduplicator|Dispute & Chargeback Logger|Dunning & Retry|POS Hardware Bridge|ACH & Wire Adapters|UPI AutoPay Mandate|Payouts|Reconciliation|Credit Notes|Proforma to Invoice|Invoice Send|TCS & Tax Collected'.split('|')},
 {id:'talk',code:'COM',label:'Talk & Channels',title:'Communications & Meta Channels',cadence:'Daily',first:41,icon:MessagesSquare,summary:'Conversations, customer support and approved channel actions.',names:'WhatsApp Hub|Instagram & Messenger Hub|Facebook Shop Sync|Business Inbox|Notification Center|Template Manager|Chat Bot Builder|Broadcast Lists|Auto-Responder|Voice Note Transcribe|Call Log to CRM|Email Inbox|Web Chat Widget|Bot-to-Human Handover|Canned Replies|CSAT Survey|Contact Sync|Spam Filter|Sentiment Monitor|Reviews Collector'.split('|')},
 {id:'stock',code:'INV',label:'Stock & Products',title:'Product & Inventory Graph',cadence:'Daily',first:61,icon:Package,summary:'Catalog, stock movements and product intelligence.',names:'Product Catalog Graph|Inventory Movements Ledger|Shelf Scanner|Low-Stock Alert|Warehouse & Location Matrix|Barcode & QR Generator|Supplier Purchase Orders|Variant Matrix|Bundles & Kits|Batch & Expiry|Serial Number Registry|BOM Configurator|Reorder Point Calculator|Inter-Warehouse Transfer|Shrinkage & Damage Ledger|Dropship Vendor Bridge|Consignment Manager|POD Asset Matcher|RMA Stock Isolator|Digital Asset Delivery'.split('|')},
 {id:'growth',code:'GRW',label:'Growth & Store',title:'Growth, Ads & Store',cadence:'Daily',first:81,icon:TrendingUp,summary:'Draft creative, manage campaigns and inspect business growth.',names:'Social Media Studio|Campaign Manager|Online Store Builder|Website Builder|Analytics & Funnel|SEO & Content|Referrals & Loyalty|Email Marketing|Push Notifications|SMS Campaigns|Content Calendar|Coupon Engine|UTM Tracker|Pixel Manager|Audience Builder|Landing Page Builder|Influencer Tracker|Trend Spotter|Growth Experiments|A/B Variant Dispatcher'.split('|')},
 {id:'operations',code:'OPS',label:'Run & Team',title:'Run, Team & Projects',cadence:'Weekly',first:101,icon:Users,summary:'Work queues, projects, people and operational reviews.',names:'Staff Management|Tasks & Goals|Projects|Attendance & Leave|Time Tracker|Meeting Notes|SOP Library|Vendors & Purchases|Shipping & Delivery|File Approvals|Incident Log|Onboarding Checklist|Asset Assignment|Access Log|Automation Library|Performance Review|Backup Drills|Compliance Checklist|Audit Trail|Payroll & Staff Payments'.split('|')},
 {id:'builder',code:'BLD',label:'Builder & PWA',title:'Headless Renderer & PWA',cadence:'Weekly',first:121,icon:PanelsTopLeft,summary:'Content, design and deployment tools grouped in one workspace.',names:'Media & Assets Gallery|Content Block Studio|Theme Customizer|Form & Intake Constructor|Asset Transform Pipeline|CDN Controller|Deep Linking Registry|Localization Matrix|Accessibility Verifier|Component Dependency Tree|Hydration Optimizer|UGC Moderation Desk|SSR State Hydrator|Font & Icon Optimizer|Design Token Exporter|App Builder & PWA Wrapper|Domain & DNS Manager|Static Build Pipeline|Design System Tokens|UGC Store Gallery'.split('|')},
 {id:'brain',code:'AI',label:'Brain & Agents',title:'Brain & Agentic Engine',cadence:'Weekly',first:141,icon:Brain,summary:'AI assistance, approval boundaries, knowledge and evaluations.',names:'AI Assistant|Voice HQ|Evidence & Audit|Prompt Library|Model Router|Tool Registry|Memory Graph|Run Summary & Evidence|Validation Gate|Approval Desk|Commit Executor|Observer Ledger|Evaluation Harness|System Cards Publisher|Translation Layer|Vision Service|Recommendations|Forecasting|Anomaly Detector|Founder Copilot'.split('|')},
 {id:'foundation',code:'FND',label:'Foundation & Legal',title:'Foundation & Legal',cadence:'Setup',first:161,icon:Landmark,summary:'Identity, records, privacy and business setup.',names:'Dashboard & Overview|Business Identity Profile|Documents Vault|Business Card Studio|Terms & Privacy Versions|Trademark & IP Tracker|License & Permit Registry|KYC Inbound Hub|DPIA Review|AML Transaction Monitor|Corporate Resolution Log|Customs & Tariff HSN Engine|Grievance & Whistleblower Portal|Regulatory Reporting Dispatcher|Data Residency Controls|Data Deletion Requests|Encryption Configuration|Backup & Snapshot Ledger|Device Passkey Registrar|Settings & Sovereignty'.split('|')},
 {id:'system',code:'SYS',label:'Network & Infra',title:'Network & Infrastructure OS',cadence:'Setup',first:181,icon:Server,summary:'Connections, infrastructure and operational health.',names:'Integrations & Adapters|Workflows Broker|Database Migration Ledger|API Gateway & Rate Limiter|Task Queue Orchestrator|Webhook Listener Pool|Telemetry & Logs|Health Heartbeat|Container Console|Edge Cache Matrix|Object Storage Router|Connection Pool Optimizer|Service Mesh Directory|Hardware Key Validator|Zero-Trust Network Access|Dead-Letter Remediation|Crash Dump Parser|Failover Cluster Director|Domain, DNS & Certificates|Static Asset Pipeline'.split('|')},
];
export type WorkspaceTool={id:number;category:string;name:string;status:'available'|'existing'|'planned';href?:string;scope:string};
const targets:Record<number,{href:string;status:'available'|'existing';scope:string}>={
 1:{href:'/business?view=orders',status:'available',scope:'Local invoice drafts, review, rejection and issuance; not the entire proposed order lifecycle.'},
 4:{href:'/business?view=customers',status:'available',scope:'Create and list local customer records.'},
 5:{href:'/funnel',status:'existing',scope:'Inherited funnel workspace; connected data depends on configuration.'},
 21:{href:'/business?view=invoices',status:'available',scope:'Hash-bound issuance, immutable snapshots and printable basic invoices.'},
 23:{href:'/business?view=invoices',status:'available',scope:'Optional UPI payment URI only. No PSP gateway, paise-offset matching or verified settlement.'},
 24:{href:'/business?view=invoices',status:'available',scope:'Pending invoices and explicit manual reconciliation. No provider-verified settlement.'},
 29:{href:'/business?view=evidence',status:'available',scope:'Command idempotency and consumed approval checks in the local commerce flow.'},
 36:{href:'/business?view=invoices',status:'available',scope:'Operator-entered reconciliation references only; not bank API or email verification.'},
 44:{href:'/inbox',status:'existing',scope:'Inherited inbox. Provider coverage and configuration vary.'},
 45:{href:'/',status:'available',scope:'Derived pending approvals, unpaid requests, out-of-stock alerts and due reminders.'},
 52:{href:'/inbox',status:'existing',scope:'Inherited email connector; must be configured before use.'},
 61:{href:'/business?view=inventory',status:'available',scope:'Local SKU catalog, integer prices, tax settings and opening stock.'},
 62:{href:'/business?view=evidence',status:'available',scope:'Transactional stock movements with issuance audit evidence; local tamper-evident chain.'},
 81:{href:'/social',status:'existing',scope:'Inherited social workspace; not a newly verified Meta publishing integration.'},
 82:{href:'/adpilot',status:'existing',scope:'Inherited campaign workspace; external APIs require setup and separate verification.'},
 85:{href:'/analytics',status:'existing',scope:'Inherited analytics view; no fabricated traffic or conversion claims.'},
 102:{href:'/tasks',status:'existing',scope:'Existing task board; Mission Control also supports persisted personal reminders.'},
 119:{href:'/business?view=evidence',status:'available',scope:'Local commerce audit events and hash-chain verification.'},
 123:{href:'/setup',status:'existing',scope:'Application appearance settings; not a storefront theme builder.'},
 141:{href:'/wizard',status:'existing',scope:'Inherited assistant; provider setup and tool permissions apply.'},
 143:{href:'/business?view=evidence',status:'available',scope:'Commerce hashes and audit events; no passkey assertion or hardware signature yet.'},
 144:{href:'/skills',status:'existing',scope:'Inherited skill library; not a new prompt evaluation system.'},
 146:{href:'/integrations',status:'existing',scope:'Existing connector directory; do not assume executable MCP access.'},
 147:{href:'/business?view=overview',status:'available',scope:'Graph derived from local customers, products and orders; Faiss is planned.'},
 149:{href:'/business?view=orders',status:'available',scope:'Server-side schema, stock, expiry and payload-hash validation.'},
 150:{href:'/business?view=orders',status:'available',scope:'Human review with operator session. Passkey step-up is not implemented.'},
 151:{href:'/business?view=orders',status:'available',scope:'Idempotent transactional local invoice issuance.'},
 152:{href:'/business?view=evidence',status:'available',scope:'Tamper-evident local audit; not administrator-proof immutable storage.'},
 160:{href:'/',status:'available',scope:'Deterministic operational summary and personal reminders; no autonomous generated brief.'},
 161:{href:'/',status:'available',scope:'Mission Control using observed local records and connection status.'},
 162:{href:'/business?view=invoices',status:'available',scope:'Merchant invoice profile, address, tax ID and optional VPA.'},
 180:{href:'/setup',status:'existing',scope:'Current single-operator settings. No selectable enclaves or residency attestation.'},
 181:{href:'/integrations',status:'existing',scope:'Inherited connector status and setup surfaces.'},
 188:{href:'/',status:'available',scope:'Timestamped polling and observed connector state; not infrastructure SLA monitoring.'},
};
export const WORKSPACE_TOOLS:WorkspaceTool[]=WORKSPACE_CATEGORIES.flatMap(c=>c.names.map((name,i)=>({id:c.first+i,category:c.id,name,...(targets[c.first+i]??{status:'planned' as const,scope:'Roadmap item. No executable implementation is claimed.'})})));
export const PINNED_UTILITIES=[
 {id:201,key:'settings',label:'Settings & Control',icon:Settings,summary:'Appearance, business profile and integration configuration.',links:[{label:'Application settings',href:'/setup'},{label:'Merchant profile',href:'/business?view=invoices'},{label:'Connections',href:'/integrations'}]},
 {id:202,key:'upgrade',label:'Upgrade & Billing',icon:CreditCard,summary:'Core self-hosted software has no product license paywall. Hosting and provider services can have costs.',links:[{label:'Inspect usage',href:'/usage'}]},
 {id:203,key:'support',label:'Help & Support',icon:CircleHelp,summary:'Product help and customer conversations have separate destinations. No support ticket backend is claimed.',links:[{label:'Customer inbox',href:'/inbox'},{label:'Setup checklist',href:'/setup'},{label:'Project roadmap',href:'/roadmap'}]},
 {id:204,key:'developer',label:'API & Webhooks',icon:Code2,summary:'Current commerce API and integration setup. A downloadable public SDK and generic webhook tester remain planned.',links:[{label:'Integration directory',href:'/integrations'},{label:'System blueprint',href:'/blueprint'}]},
 {id:205,key:'account',label:'Account',icon:UserCircle,summary:'Single-operator security settings. Individual team accounts, passkeys, personal vaults and privacy export/delete remain planned.',links:[{label:'Operator security',href:'/setup'},{label:'Sign in / manage session',href:'/login'}]},
];
export type MainEntry={id:string;label:string;href:string;icon:LucideIcon;cadence:string;aliases?:string[]};
export const MAIN_ENTRIES:MainEntry[]=[
 {id:'mission',label:'Mission Control',href:'/',icon:Home,cadence:'Command'},
 ...WORKSPACE_CATEGORIES.map(c=>({id:c.id,label:c.label,href:`/workspace/${c.id}`,icon:c.icon,cadence:c.cadence,aliases: c.id==='orders'?['/business','/funnel','/clients','/brand-deals']:c.id==='money'?['/finances','/trading']:c.id==='talk'?['/inbox']:c.id==='growth'?['/social','/adpilot','/creative-engine','/analytics','/lab','/lead-magnets']:c.id==='operations'?['/tasks','/org']:c.id==='brain'?['/wizard','/agents','/chats','/skills','/brain','/database','/knowledge','/drift']:c.id==='system'?['/integrations','/usage','/compute','/blueprint','/roadmap']:[]})),
 {id:'workflows',label:'Workflows',href:'/workflows',icon:Workflow,cadence:'Review'},
 {id:'evidence',label:'Evidence & Audit',href:'/workspace/evidence',icon:ShieldCheck,cadence:'Review'},
];
export const PINNED_ENTRIES:MainEntry[]=PINNED_UTILITIES.map(p=>({id:p.key,label:p.label,href:`/workspace/${p.key}`,icon:p.icon,cadence:'Pinned',aliases:p.key==='settings'?['/setup']:[]}));
export const SIDEBAR_ENTRIES=[...MAIN_ENTRIES,...PINNED_ENTRIES];
export function workspaceActive(pathname:string):string|null {
 const path=pathname.split(/[?#]/)[0].replace(/\/$/,'')||'/';
 const exact=SIDEBAR_ENTRIES.find(e=>e.href===path);if(exact)return exact.id;
 const aliases=SIDEBAR_ENTRIES.flatMap(e=>(e.aliases||[]).map(a=>({id:e.id,a}))).sort((a,b)=>b.a.length-a.a.length);
 return aliases.find(({a})=>path===a||path.startsWith(a+'/'))?.id||null;
}
export function workspaceTitle(pathname:string):string|undefined {return SIDEBAR_ENTRIES.find(e=>e.id===workspaceActive(pathname))?.label;}

export function workspaceDigitViews():string[] { return MAIN_ENTRIES.slice(0,9).map(e=>e.href); }
