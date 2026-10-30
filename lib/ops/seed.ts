/*
 * Demonstration data for the prototype. Rather than hand-writing balances and
 * histories, the seed replays real workflows through the service layer with a
 * moving clock: vessel calls are created, berthed and worked, containers are
 * discharged, cleared, paid for, tokened and gated, stock is received, allocated
 * and picked. Every number on every screen therefore reconciles with its ledger.
 *
 * Network, parties and vessel names follow Gulftainer's published footprint
 * (Khorfakkan, Sharjah, Iraq Container Terminal, GSCCO, GT USA, SICD, Sajaa,
 * Umm Qasr Logistics Centre, Momentum Logistics, GT Lines).
 */

import type { Container, Employee, Location, OpsDB, Organization, Party, Role } from './types';
import { DEFAULT_TARIFF } from './tariff';
import { makeCtx, newId, type Ctx } from './core';
import { makeContainerNumber } from './iso6346';
import * as terminal from './services/terminal';
import * as logistics from './services/logistics';
import * as warehouse from './services/warehouse';
import * as finance from './services/finance';
import * as shared from './services/shared';

export const SCHEMA_VERSION = 8;

/* ------------------------------------------------------------ Clock & helpers */

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

function makeClock(base: Date) {
  return (daysAgo: number, hour = 9, minute = 0) => {
    const date = new Date(base.getTime() - daysAgo * DAY);
    date.setUTCHours(hour, minute, 0, 0);
    return date.toISOString();
  };
}

/** Small deterministic PRNG so the seed is identical on every reset. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function emptyDB(seededAt: string): OpsDB {
  return {
    schemaVersion: SCHEMA_VERSION,
    seededAt,
    settings: { offline: false, lowStockThreshold: 40, adjustmentApprovalThreshold: 25, counters: {} },
    tariff: structuredClone(DEFAULT_TARIFF),
    organizations: [], locations: [], employees: [], parties: [], vesselCalls: [], containers: [], containerEvents: [], tokens: [], gateTransactions: [],
    inlandTransfers: [], transportJobs: [], skus: [], balances: [], movements: [], warehouseOrders: [], operations: [], tasks: [], documents: [], charges: [],
    invoices: [], notifications: [], audit: [], approvals: [], outbox: [], offlineQueue: [], integrations: [], idempotency: {},
  };
}

/* ------------------------------------------------------------ Master data */

const ORGS: Organization[] = [
  { id: 'org-gt', code: 'GT', name: 'Gulftainer Company Limited', country: 'United Arab Emirates', platform: 'GT Ports' },
  { id: 'org-ict', code: 'ICT', name: 'Iraq Container Terminal', country: 'Iraq', platform: 'GT Ports' },
  { id: 'org-gscco', code: 'GSCCO', name: 'Gulf Stevedoring Contracting Company', country: 'Saudi Arabia', platform: 'GT Ports' },
  { id: 'org-gtusa', code: 'GTUSA', name: 'GT USA', country: 'United States', platform: 'GT Ports' },
  { id: 'org-ml', code: 'ML', name: 'Momentum Logistics', country: 'United Arab Emirates', platform: 'GT Logistics' },
  { id: 'org-gtl', code: 'GTL', name: 'GT Lines', country: 'United Arab Emirates', platform: 'GT Maritime' },
];

const LOCATIONS: Location[] = [
  { id: 'loc-kct', orgId: 'org-gt', code: 'KCT', name: 'Khorfakkan Container Terminal', type: 'terminal', country: 'United Arab Emirates', city: 'Khorfakkan', timezone: 'Asia/Dubai', operatingHours: '24 hours, 365 days', bonded: false, berths: 6, quayLengthM: 1880, draftM: 16, yardCapacityTeu: 50000, reeferPlugs: 623, warehouseSqm: 3000, active: true },
  { id: 'loc-sct', orgId: 'org-gt', code: 'SCT', name: 'Sharjah Container Terminal', type: 'terminal', country: 'United Arab Emirates', city: 'Sharjah', timezone: 'Asia/Dubai', operatingHours: '24 hours, 365 days', bonded: false, berths: 4, quayLengthM: 760, draftM: 12, yardCapacityTeu: 15000, reeferPlugs: 180, active: true },
  { id: 'loc-hpt', orgId: 'org-gt', code: 'HPT', name: 'Hamriyah Port Terminal', type: 'terminal', country: 'United Arab Emirates', city: 'Hamriyah', timezone: 'Asia/Dubai', operatingHours: '24 hours, 365 days', bonded: false, berths: 2, quayLengthM: 420, draftM: 14, yardCapacityTeu: 6000, reeferPlugs: 60, active: true },
  { id: 'loc-ict', orgId: 'org-ict', code: 'ICT', name: 'Iraq Container Terminal, Umm Qasr', type: 'terminal', country: 'Iraq', city: 'Umm Qasr', timezone: 'Asia/Baghdad', operatingHours: '24 hours, 365 days', bonded: false, berths: 2, quayLengthM: 520, draftM: 12, yardCapacityTeu: 12000, reeferPlugs: 120, active: true },
  { id: 'loc-nct', orgId: 'org-gscco', code: 'NCT', name: 'Northern Container Terminal, Jeddah', type: 'terminal', country: 'Saudi Arabia', city: 'Jeddah', timezone: 'Asia/Riyadh', operatingHours: '24 hours, 365 days', bonded: false, berths: 5, quayLengthM: 1300, draftM: 15, yardCapacityTeu: 30000, reeferPlugs: 400, active: true },
  { id: 'loc-jcp', orgId: 'org-gscco', code: 'JCP', name: 'Jubail Commercial Port', type: 'terminal', country: 'Saudi Arabia', city: 'Jubail', timezone: 'Asia/Riyadh', operatingHours: '24 hours, 365 days', bonded: false, berths: 3, quayLengthM: 700, draftM: 14, yardCapacityTeu: 14000, reeferPlugs: 150, active: true },
  { id: 'loc-cct', orgId: 'org-gtusa', code: 'CCT', name: 'Canaveral Cargo Terminal', type: 'terminal', country: 'United States', city: 'Port Canaveral, Florida', timezone: 'America/New_York', operatingHours: '06:00 to 22:00, Monday to Saturday', bonded: true, berths: 2, quayLengthM: 400, draftM: 12, yardCapacityTeu: 5000, reeferPlugs: 90, warehouseSqm: 5200, active: true },
  { id: 'loc-sicd', orgId: 'org-ml', code: 'SICD', name: 'Sharjah Inland Container Depot', type: 'inland_depot', country: 'United Arab Emirates', city: 'Sharjah', timezone: 'Asia/Dubai', operatingHours: '06:00 to 22:00, Sunday to Saturday', bonded: true, yardCapacityTeu: 18000, reeferPlugs: 200, warehouseSqm: 28000, active: true },
  { id: 'loc-sdp', orgId: 'org-ml', code: 'SDP', name: 'Sajaa Bonded Dry Port', type: 'inland_depot', country: 'United Arab Emirates', city: 'Al Sajaa, Sharjah', timezone: 'Asia/Dubai', operatingHours: '06:00 to 22:00, Sunday to Saturday', bonded: true, yardCapacityTeu: 10000, reeferPlugs: 80, active: true },
  { id: 'loc-uqlc', orgId: 'org-ml', code: 'UQLC', name: 'Umm Qasr Logistics Centre', type: 'logistics_centre', country: 'Iraq', city: 'Umm Qasr', timezone: 'Asia/Baghdad', operatingHours: '07:00 to 19:00, Saturday to Thursday', bonded: true, yardCapacityTeu: 4000, reeferPlugs: 40, warehouseSqm: 50000, active: true },
  { id: 'loc-jicd', orgId: 'org-gscco', code: 'JICD', name: 'Jubail Inland Container Depot and Empty Yard', type: 'inland_depot', country: 'Saudi Arabia', city: 'Jubail', timezone: 'Asia/Riyadh', operatingHours: '06:00 to 22:00, Saturday to Thursday', bonded: false, yardCapacityTeu: 3000, reeferPlugs: 20, active: true },
  { id: 'loc-siw', orgId: 'org-ml', code: 'SIW', name: 'Momentum Warehouse, SICD Unit 12', type: 'warehouse', country: 'United Arab Emirates', city: 'Sharjah', timezone: 'Asia/Dubai', operatingHours: '08:00 to 17:00, Sunday to Saturday', bonded: true, warehouseSqm: 4200, active: true },
  { id: 'loc-sjw', orgId: 'org-ml', code: 'SJW', name: 'Sajaa Distribution Centre, SIIP', type: 'warehouse', country: 'United Arab Emirates', city: 'Al Sajaa, Sharjah', timezone: 'Asia/Dubai', operatingHours: '08:00 to 17:00, Sunday to Saturday', bonded: false, warehouseSqm: 10200, active: true },
  { id: 'loc-cbw', orgId: 'org-gtusa', code: 'CBW', name: 'Canaveral Bonded Warehouse', type: 'warehouse', country: 'United States', city: 'Port Canaveral, Florida', timezone: 'America/New_York', operatingHours: '07:00 to 19:00, Monday to Friday', bonded: true, warehouseSqm: 5200, active: true },
];

const UAE_ALL = ['loc-kct', 'loc-sct', 'loc-hpt', 'loc-sicd', 'loc-sdp', 'loc-siw', 'loc-sjw'];

function employee(id: string, username: string, name: string, role: Role, orgId: string, locationIds: string[], createdAt: string): Employee {
  return { id, username, name, email: `${username}@gulftainer.com`, role, orgId, locationIds, active: true, createdAt };
}

function party(id: string, code: string, name: string, type: Party['type'], country: string, portalRegistered = true, creditTerms = 30): Party {
  return { id, code, name, type, country, email: `accounts@${code.toLowerCase()}.example`, portalRegistered, creditTerms, active: true };
}

/* ------------------------------------------------------------ Seed */

export function createSeedDB(base = new Date()): OpsDB {
  const now = base.toISOString();
  const db = emptyDB(now);
  const at = makeClock(base);
  const random = mulberry32(20261030);
  const pick = <T,>(list: T[]) => list[Math.floor(random() * list.length)];

  db.organizations.push(...ORGS);
  db.locations.push(...LOCATIONS);

  const E = {
    operations: employee('emp-operations', 'operations', 'Operations Administrator', 'system_admin', 'org-gt', [], at(400)),
    ayesha: employee('emp-ayesha', 'ayesha', 'Ayesha Rahman', 'system_admin', 'org-gt', [], at(400)),
    integration: employee('emp-integration', 'integration', 'Integration service', 'system_admin', 'org-gt', [], at(400)),
    portal: employee('emp-portal', 'portal', 'Customer portal', 'customer_service', 'org-gt', [...UAE_ALL, 'loc-ict', 'loc-nct', 'loc-jcp', 'loc-cct', 'loc-uqlc', 'loc-jicd'], at(400)),
    omar: employee('emp-omar', 'omar', 'Omar Al Suwaidi', 'terminal_ops', 'org-gt', ['loc-kct', 'loc-sct', 'loc-hpt'], at(380)),
    priya: employee('emp-priya', 'priya', 'Priya Nair', 'planner', 'org-gt', ['loc-kct', 'loc-sct'], at(360)),
    khalid: employee('emp-khalid', 'khalid', 'Khalid Al Mansoori', 'gate_officer', 'org-gt', ['loc-kct'], at(350)),
    fatima: employee('emp-fatima', 'fatima', 'Fatima Hassan', 'customer_service', 'org-gt', ['loc-kct', 'loc-sct', 'loc-hpt', 'loc-sicd', 'loc-sdp'], at(340)),
    daniel: employee('emp-daniel', 'daniel', 'Daniel Okafor', 'warehouse_worker', 'org-ml', ['loc-siw', 'loc-sjw'], at(300)),
    maria: employee('emp-maria', 'maria', 'Maria Santos', 'warehouse_supervisor', 'org-ml', ['loc-siw', 'loc-sjw', 'loc-sicd'], at(320)),
    rahul: employee('emp-rahul', 'rahul', 'Rahul Menon', 'inventory_manager', 'org-ml', ['loc-siw', 'loc-sjw', 'loc-uqlc', 'loc-cbw'], at(330)),
    hassan: employee('emp-hassan', 'hassan', 'Hassan Ali', 'transport_manager', 'org-ml', ['loc-kct', 'loc-sct', 'loc-sicd', 'loc-sdp', 'loc-siw', 'loc-sjw'], at(310)),
    lucas: employee('emp-lucas', 'lucas', 'Lucas Ferreira', 'finance_manager', 'org-gt', UAE_ALL, at(290)),
    hana: employee('emp-hana', 'hana', 'Hana Kim', 'auditor', 'org-gt', [], at(200)),
    ali: employee('emp-ali', 'ali', 'Ali Jabbar', 'terminal_ops', 'org-ict', ['loc-ict', 'loc-uqlc'], at(280)),
    noura: employee('emp-noura', 'noura', 'Noura Al Qahtani', 'planner', 'org-gscco', ['loc-nct', 'loc-jcp', 'loc-jicd'], at(270)),
    james: employee('emp-james', 'james', 'James Carter', 'terminal_ops', 'org-gtusa', ['loc-cct', 'loc-cbw'], at(260)),
    sara: employee('emp-sara', 'sara', 'Sara Ibrahim', 'gate_officer', 'org-ml', ['loc-sicd', 'loc-sdp'], at(250)),
    yusuf: employee('emp-yusuf', 'yusuf', 'Yusuf Omar', 'warehouse_worker', 'org-ml', ['loc-uqlc'], at(240)),
  };
  db.employees.push(...Object.values(E));

  const P = {
    msc: party('party-msc', 'MSCU', 'MSC Mediterranean Shipping Company', 'shipping_line', 'Switzerland'),
    maersk: party('party-maersk', 'MAEU', 'Maersk Line', 'shipping_line', 'Denmark'),
    cma: party('party-cma', 'CMAU', 'CMA CGM', 'shipping_line', 'France'),
    hapag: party('party-hapag', 'HLCU', 'Hapag-Lloyd', 'shipping_line', 'Germany'),
    evergreen: party('party-evergreen', 'EGHU', 'Evergreen Line', 'shipping_line', 'Taiwan'),
    gtlines: party('party-gtlines', 'GTLU', 'GT Lines', 'shipping_line', 'United Arab Emirates'),
    alfuttaim: party('party-alfuttaim', 'AFL', 'Al Futtaim Logistics', 'consignee', 'United Arab Emirates'),
    lulu: party('party-lulu', 'LULU', 'Lulu Hypermarket', 'consignee', 'United Arab Emirates'),
    sharjahCement: party('party-scf', 'SCF', 'Sharjah Cement Factory', 'consignee', 'United Arab Emirates'),
    alghurair: party('party-agf', 'AGF', 'Al Ghurair Foods', 'consignee', 'United Arab Emirates', true, 45),
    emiratesSteel: party('party-esa', 'ESA', 'Emirates Steel Arkan', 'consignee', 'United Arab Emirates'),
    rakCeramics: party('party-rak', 'RAKC', 'RAK Ceramics', 'consignee', 'United Arab Emirates'),
    basraTrading: party('party-bgt', 'BGT', 'Basra General Trading', 'consignee', 'Iraq', false),
    jubailPetro: party('party-jpc', 'JPC', 'Jubail Petrochemical Company', 'consignee', 'Saudi Arabia'),
    floridaFresh: party('party-ffp', 'FFP', 'Florida Fresh Produce', 'consignee', 'United States'),
    alNahdi: party('party-nahdi', 'NAHDI', 'Al Nahdi Clearing and Forwarding', 'clearing_agent', 'United Arab Emirates'),
    gulfBrokers: party('party-gcb', 'GCB', 'Gulf Customs Brokers', 'clearing_agent', 'United Arab Emirates'),
    momentumFf: party('party-mlff', 'MLFF', 'Momentum Freight Forwarding', 'clearing_agent', 'United Arab Emirates'),
    momentumTpt: party('party-mltpt', 'MLTPT', 'Momentum Logistics Transport', 'haulier', 'United Arab Emirates'),
    sahraa: party('party-sahraa', 'SAHRA', 'Al Sahraa Transport', 'haulier', 'United Arab Emirates'),
    emiratesTpt: party('party-etc', 'ETC', 'Emirates Transport Company', 'haulier', 'United Arab Emirates'),
    basraHaulage: party('party-bhl', 'BHL', 'Basra Haulage', 'haulier', 'Iraq', false),
    unilever: party('party-unilever', 'UNIL', 'Unilever Gulf', 'contract_customer', 'United Arab Emirates'),
    afMotors: party('party-afm', 'AFM', 'Al-Futtaim Motors', 'contract_customer', 'United Arab Emirates'),
    schlumberger: party('party-slb', 'SLB', 'Schlumberger Middle East', 'contract_customer', 'United Arab Emirates'),
    carrefour: party('party-crf', 'CRF', 'Majid Al Futtaim Retail', 'contract_customer', 'United Arab Emirates'),
    ega: party('party-ega', 'EGA', 'Emirates Global Aluminium', 'shipper', 'United Arab Emirates'),
  };
  db.parties.push(...Object.values(P));

  const ctx = (actor: Employee, time: string): Ctx => makeCtx(db, actor, time);
  const serials: Record<string, number> = {};
  const nextSerial = (owner: string) => { serials[owner] = (serials[owner] ?? 884200) + 7; return serials[owner]; };
  const num = (owner: string) => makeContainerNumber(owner, nextSerial(owner));
  const key = () => newId();

  const commodities = ['Consumer electronics', 'Ceramic tiles', 'Rice, 25 kg bags', 'Auto spare parts', 'Steel coils', 'Frozen poultry', 'Furniture, flat packed', 'Textiles', 'Cement additives', 'Beverages'];
  const positions = (block: string) => `${block}${String(Math.floor(random() * 12) + 1).padStart(2, '0')}-${Math.floor(random() * 6) + 1}-${Math.floor(random() * 4) + 1}`;

  /* ---------------------------------------------------------- Story 1: MSC AURORA at KCT, completed 8 days ago */
  const aurora = terminal.createVesselCall(ctx(E.priya, at(14, 8)), { voyage: 'MSAU442W', vessel: 'MSC AURORA', lineId: P.msc.id, terminalId: 'loc-kct', berth: '3', service: 'Indian Ocean Express', eta: at(9, 4), etb: at(9, 6), etd: at(8, 2), plannedDischarge: 14, plannedLoad: 6, cranesAllocated: 4 });
  const auroraImports: Container[] = [];
  const auroraSpec = [
    { consignee: P.alfuttaim, agent: P.alNahdi, size: '40' as const, type: 'HC' as const, commodity: 'Consumer electronics' },
    { consignee: P.alfuttaim, agent: P.alNahdi, size: '40' as const, type: 'HC' as const, commodity: 'Consumer electronics' },
    { consignee: P.lulu, agent: P.gulfBrokers, size: '40' as const, type: 'RF' as const, commodity: 'Frozen poultry', reefer: { setpointC: -18 } },
    { consignee: P.lulu, agent: P.gulfBrokers, size: '20' as const, type: 'GP' as const, commodity: 'Rice, 25 kg bags' },
    { consignee: P.sharjahCement, agent: P.momentumFf, size: '20' as const, type: 'GP' as const, commodity: 'Cement additives', dg: { imoClass: '8', unNumber: 'UN1824' } },
    { consignee: P.alghurair, agent: P.gulfBrokers, size: '40' as const, type: 'GP' as const, commodity: 'Rice, 25 kg bags' },
    { consignee: P.alghurair, agent: P.gulfBrokers, size: '40' as const, type: 'GP' as const, commodity: 'Beverages' },
    { consignee: P.emiratesSteel, agent: P.alNahdi, size: '20' as const, type: 'GP' as const, commodity: 'Steel coils', oog: false },
    { consignee: P.rakCeramics, agent: P.momentumFf, size: '40' as const, type: 'HC' as const, commodity: 'Furniture, flat packed' },
    { consignee: P.rakCeramics, agent: P.momentumFf, size: '40' as const, type: 'OT' as const, commodity: 'Kiln rollers, out of gauge', oog: true },
  ];
  for (const spec of auroraSpec) {
    auroraImports.push(terminal.registerContainer(ctx(E.priya, at(12, 10)), { number: num('MSCU'), size: spec.size, type: spec.type, category: 'import', full: true, lineId: P.msc.id, consigneeId: spec.consignee.id, clearingAgentId: spec.agent.id, shipperName: 'Various', commodity: spec.commodity, grossWeightKg: spec.size === '20' ? 18500 : 24800, sealNumber: `MSC${Math.floor(random() * 900000 + 100000)}`, dg: spec.dg ?? null, oog: !!spec.oog, reefer: spec.reefer ?? null, inboundCallId: aurora.id }));
  }
  const auroraTs: Container[] = [];
  for (let index = 0; index < 4; index += 1) {
    auroraTs.push(terminal.registerContainer(ctx(E.priya, at(12, 10)), { number: num('MSCU'), size: index % 2 ? '40' : '20', type: 'GP', category: 'transhipment', full: true, lineId: P.msc.id, commodity: 'Transhipment to Umm Qasr', grossWeightKg: 21000, sealNumber: `MSC${Math.floor(random() * 900000 + 100000)}`, inboundCallId: aurora.id }));
  }
  shared.addDocument(ctx(E.fatima, at(11, 9)), { type: 'BAPLIE', title: 'BAPLIE MSC AURORA MSAU442W', vesselCallId: aurora.id, file: { fileName: 'BAPLIE_MSAU442W.edi', sizeBytes: 182340, mimeType: 'application/edi-x12', checksum: '3f2a9c1e7b4d5f60a8c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3' }, note: 'Received by EDI from MSC', legallySignificant: false, retentionYears: 3, access: [] });
  terminal.recordPreArrival(ctx(E.fatima, at(11, 9)), { callId: aurora.id, doc: 'dischargeList' });
  terminal.recordPreArrival(ctx(E.fatima, at(11, 9)), { callId: aurora.id, doc: 'loadList' });
  terminal.recordPreArrival(ctx(E.fatima, at(11, 9)), { callId: aurora.id, doc: 'dgList' });
  terminal.recordPreArrival(ctx(E.fatima, at(12, 9)), { callId: aurora.id, notice: 'h72' });
  terminal.recordPreArrival(ctx(E.fatima, at(11, 9)), { callId: aurora.id, notice: 'h48' });
  terminal.recordPreArrival(ctx(E.fatima, at(10, 9)), { callId: aurora.id, notice: 'h24' });
  terminal.berthVessel(ctx(E.omar, at(9, 6, 20)), { callId: aurora.id });
  terminal.startVesselOperations(ctx(E.omar, at(9, 7)), { callId: aurora.id });
  [...auroraImports, ...auroraTs].forEach((container, index) => {
    terminal.dischargeContainer(ctx(E.omar, at(9, 8 + Math.floor(index / 2), (index % 2) * 30)), { callId: aurora.id, containerId: container.id, yardPosition: positions(container.category === 'transhipment' ? 'T' : container.reefer ? 'R' : 'C'), idempotencyKey: key() });
  });
  // Export loads on MSC AURORA: six EGA aluminium boxes received by road during the gate window.
  for (let index = 0; index < 6; index += 1) {
    const container = terminal.registerContainer(ctx(E.fatima, at(13, 11)), { number: num('MSCU'), size: '20', type: 'GP', category: 'export', full: true, lineId: P.msc.id, shipperName: P.ega.name, commodity: 'Aluminium billets', grossWeightKg: 27800, sealNumber: `EGA${100 + index}`, outboundCallId: aurora.id });
    const token = terminal.generateToken(ctx(E.portal, at(12, 7)), { containerId: container.id, type: 'export_dropoff', haulierId: P.momentumTpt.id, truckPlate: `SHJ ${41200 + index}`, driverName: pick(['Ravi Kumar', 'Mohammed Saleh', 'Arun Pillai', 'Tariq Aziz']), slotStart: at(12, 8 + index), onBehalfOf: P.ega.name });
    terminal.marshallingYardArrival(ctx(E.khalid, at(12, 8 + index, 10)), { tokenId: token.id });
    terminal.gateIn(ctx(E.khalid, at(12, 8 + index, 25)), { tokenId: token.id, yardPosition: positions('E'), sealVerified: true, damageRemarks: '', vgmKg: 27650 + index * 40, idempotencyKey: key() });
    terminal.updateCustoms(ctx(E.fatima, at(11, 10)), { containerId: container.id, status: 'cleared', reference: `SHJ-EXP-${77100 + index}` });
    terminal.loadContainer(ctx(E.omar, at(8, 0, 15 * index)), { callId: aurora.id, containerId: container.id, idempotencyKey: key() });
  }
  terminal.completeVesselOperations(ctx(E.omar, at(8, 1, 40)), { callId: aurora.id, note: 'Completed 1 hour ahead of ETD' });
  terminal.departVessel(ctx(E.omar, at(8, 3)), { callId: aurora.id });

  // Clearance and collection of the AURORA imports.
  const [afl1, afl2, luluRf, luluGp, scfDg, agf1, agf2, esa1, rak1, rakOog] = auroraImports;
  function clearAndPay(container: Container, time: string, doNumber: string, expectedExitDaysAgo: number, agentRef: string) {
    terminal.updateCustoms(ctx(E.fatima, time), { containerId: container.id, status: 'cleared', reference: agentRef });
    terminal.recordDeliveryOrder(ctx(E.fatima, time), { containerId: container.id, number: doNumber, validUntil: at(-10), issuedBy: 'MSC Sharjah agency' });
    shared.addDocument(ctx(E.fatima, time), { type: 'Delivery order', title: `Delivery order ${doNumber}`, containerId: container.id, partyId: container.consigneeId ?? undefined, file: { fileName: `${doNumber}.pdf`, sizeBytes: 94210, mimeType: 'application/pdf', checksum: newId().replace(/-/g, '') + 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6' }, note: 'Issued by MSC Sharjah agency', legallySignificant: true, retentionYears: 7, access: ['customer_service', 'gate_officer', 'finance_manager', 'auditor'] });
    const collection = finance.collectContainerCharges(ctx(E.portal, time), { containerId: container.id, expectedExit: at(expectedExitDaysAgo), payableAmount: 999999, cardReference: `AUTH${Math.floor(random() * 9000000 + 1000000)}`, onBehalfOf: db.parties.find(p => p.id === container.consigneeId)!.name });
    return collection.invoice;
  }
  // (a) Three fully collected.
  for (const [index, container] of [afl1, afl2, luluGp].entries()) {
    clearAndPay(container, at(7, 10 + index), `DO-${55210 + index}`, 6, `SHJ-IMP-${90120 + index}`);
    terminal.assignHaulier(ctx(E.portal, at(7, 12 + index)), { containerId: container.id, haulierId: index === 2 ? P.sahraa.id : P.momentumTpt.id, onBehalfOf: db.parties.find(p => p.id === container.consigneeId)!.name });
    const token = terminal.generateToken(ctx(E.portal, at(7, 12 + index, 30)), { containerId: container.id, type: 'import_pickup', truckPlate: index === 2 ? 'DXB 77810' : `SHJ ${52300 + index}`, driverName: pick(['Ravi Kumar', 'Mohammed Saleh', 'Arun Pillai', 'Tariq Aziz']), slotStart: at(6, 8 + index * 2), onBehalfOf: db.parties.find(p => p.id === container.consigneeId)!.name });
    terminal.marshallingYardArrival(ctx(E.khalid, at(6, 8 + index * 2, 12)), { tokenId: token.id });
    terminal.gateOut(ctx(E.khalid, at(6, 8 + index * 2, 31)), { tokenId: token.id, sealVerified: true, damageRemarks: index === 1 ? 'Minor dent, right door, pre-existing' : '', idempotencyKey: key() });
    shared.addDocument(ctx(E.khalid, at(6, 8 + index * 2, 35)), { type: 'Equipment interchange receipt', title: `EIR gate-out ${container.number}`, containerId: container.id, file: { fileName: `EIR-${container.number}.pdf`, sizeBytes: 61020, mimeType: 'application/pdf', checksum: newId().replace(/-/g, '') + 'f0e1d2c3b4a5968778695a4b3c2d1e0f' }, note: 'Signed by driver at gate', legallySignificant: true, retentionYears: 7, access: [] });
  }
  // Momentum delivered the two Al Futtaim boxes; the Lulu rice box went with Al Sahraa.
  const aflJob = logistics.createTransportJob(ctx(E.hassan, at(6, 11)), { type: 'import_delivery', fromLocationId: 'loc-kct', toLocationId: null, customerId: P.alfuttaim.id, destinationAddress: 'Al Futtaim Logistics DC, Jebel Ali Free Zone', containerIds: [afl1.id, afl2.id], tractor: 'SHJ 52300', trailer: 'TR-118', driverName: 'Ravi Kumar', scheduledAt: at(6, 11) });
  logistics.startTransportJob(ctx(E.hassan, at(6, 11, 40)), { jobId: aflJob.id });
  logistics.completeTransportJob(ctx(E.hassan, at(6, 14, 5)), { jobId: aflJob.id, receivedBy: 'S. Pereira, inbound supervisor', note: 'Both units intact, seals matched' });
  shared.addDocument(ctx(E.hassan, at(6, 14, 10)), { type: 'Proof of delivery', title: `POD ${aflJob.reference}`, transportJobId: aflJob.id, partyId: P.alfuttaim.id, file: { fileName: `POD-${aflJob.reference}.pdf`, sizeBytes: 52110, mimeType: 'application/pdf', checksum: newId().replace(/-/g, '') + '1234567890abcdef1234567890abcdef' }, note: 'Signed at Jebel Ali', legallySignificant: true, retentionYears: 7, access: [] });

  // (b) Two ready for pick-up: the reefer has a token for today, the steel box has a haulier assigned.
  clearAndPay(luluRf, at(5, 10), 'DO-55220', -1, 'SHJ-IMP-90140');
  terminal.assignHaulier(ctx(E.portal, at(1, 15)), { containerId: luluRf.id, haulierId: P.sahraa.id, onBehalfOf: P.lulu.name });
  terminal.generateToken(ctx(E.portal, at(1, 15, 20)), { containerId: luluRf.id, type: 'import_pickup', truckPlate: 'DXB 77815', driverName: 'Mohammed Saleh', slotStart: at(0, Math.min(23, new Date(base).getUTCHours() + 1)), onBehalfOf: P.lulu.name });
  clearAndPay(esa1, at(4, 11), 'DO-55231', -2, 'SHJ-IMP-90151');
  terminal.assignHaulier(ctx(E.portal, at(1, 16)), { containerId: esa1.id, haulierId: P.emiratesTpt.id, onBehalfOf: P.emiratesSteel.name });

  // (c) Al Ghurair: two boxes uncollected beyond three days. One transferred to SICD, one on the way, plus one more still in the yard.
  terminal.updateCustoms(ctx(E.fatima, at(5, 9)), { containerId: agf1.id, status: 'cleared', reference: 'SHJ-IMP-90160' });
  terminal.updateCustoms(ctx(E.fatima, at(5, 9)), { containerId: agf2.id, status: 'cleared', reference: 'SHJ-IMP-90161' });
  const transfer1 = logistics.createInlandTransfer(ctx(E.omar, at(4, 10)), { fromLocationId: 'loc-kct', toLocationId: 'loc-sicd', containerIds: [agf1.id], reason: 'uncollected_3_days', tractor: 'SHJ 61120', trailer: 'TR-204', driverName: 'Arun Pillai' });
  logistics.dispatchInlandTransfer(ctx(E.omar, at(4, 11)), { transferId: transfer1.id });
  logistics.receiveInlandTransfer(ctx(E.sara, at(4, 14, 30)), { transferId: transfer1.id, lines: [{ containerId: agf1.id, yardPosition: 'D03-2-1' }] });
  const transfer2 = logistics.createInlandTransfer(ctx(E.omar, at(0, Math.max(0, new Date(base).getUTCHours() - 3))), { fromLocationId: 'loc-kct', toLocationId: 'loc-sdp', containerIds: [agf2.id], reason: 'yard_capacity', tractor: 'SHJ 61121', trailer: 'TR-205', driverName: 'Tariq Aziz' });
  logistics.dispatchInlandTransfer(ctx(E.omar, at(0, Math.max(0, new Date(base).getUTCHours() - 2))), { transferId: transfer2.id });
  // rak1 remains uncollected in the KCT yard: customs pending, no delivery order.
  terminal.updateCustoms(ctx(E.fatima, at(3, 9)), { containerId: rak1.id, status: 'cleared', reference: 'SHJ-IMP-90170' });

  // (d) Customs inspection: OOG kiln rollers shifted for scanning.
  terminal.updateCustoms(ctx(E.fatima, at(6, 9)), { containerId: rakOog.id, status: 'inspection', reference: 'Sharjah Customs selectivity, red channel' });
  terminal.shiftContainer(ctx(E.omar, at(6, 11)), { containerId: rakOog.id, toPosition: 'SCAN-02', purpose: 'scan', note: 'Presented at the mobile scanner', idempotencyKey: key() });

  // (e) DG box: declaration missing, DG hold stays.
  terminal.updateCustoms(ctx(E.fatima, at(6, 10)), { containerId: scfDg.id, status: 'cleared', reference: 'SHJ-IMP-90180' });
  terminal.recordDeliveryOrder(ctx(E.fatima, at(5, 10)), { containerId: scfDg.id, number: 'DO-55240', validUntil: at(-12), issuedBy: 'MSC Sharjah agency' });

  /* ---------------------------------------------------------- Story 2: GT LINES feeder to Umm Qasr took the transhipment boxes */
  const hormuz = terminal.createVesselCall(ctx(E.priya, at(10, 9)), { voyage: 'GTHZ007N', vessel: 'GT HORMUZ', lineId: P.gtlines.id, terminalId: 'loc-kct', berth: '6', service: 'UAE to Umm Qasr feeder', eta: at(5, 20), etb: at(5, 22), etd: at(4, 10), plannedDischarge: 0, plannedLoad: 4, cranesAllocated: 1 });
  for (const container of auroraTs) terminal.updateContainer(ctx(E.priya, at(8, 12)), { containerId: container.id, patch: { outboundCallId: hormuz.id } });
  terminal.recordPreArrival(ctx(E.fatima, at(6, 9)), { callId: hormuz.id, doc: 'bayPlan' });
  terminal.recordPreArrival(ctx(E.fatima, at(6, 9)), { callId: hormuz.id, doc: 'loadList' });
  terminal.recordPreArrival(ctx(E.fatima, at(6, 9)), { callId: hormuz.id, notice: 'h24' });
  terminal.berthVessel(ctx(E.omar, at(5, 22, 15)), { callId: hormuz.id });
  terminal.startVesselOperations(ctx(E.omar, at(5, 23)), { callId: hormuz.id });
  auroraTs.forEach((container, index) => terminal.loadContainer(ctx(E.omar, at(4, 1, index * 20)), { callId: hormuz.id, containerId: container.id, idempotencyKey: key() }));
  terminal.completeVesselOperations(ctx(E.omar, at(4, 3)), { callId: hormuz.id });
  terminal.departVessel(ctx(E.omar, at(4, 9, 30)), { callId: hormuz.id });

  /* ---------------------------------------------------------- Story 3: AEGEAN EXPRESS working at KCT now */
  const aegean = terminal.createVesselCall(ctx(E.priya, at(6, 9)), { voyage: 'AGEX0391W', vessel: 'AEGEAN EXPRESS', lineId: P.hapag.id, terminalId: 'loc-kct', berth: '2', service: 'Gulf India Express', eta: at(1, 20), etb: at(0, 23 - 24), etd: at(-1, 6), plannedDischarge: 16, plannedLoad: 8, cranesAllocated: 3 });
  // ETB was last night at 23:00 UTC; the call is working now.
  const aegeanBoxes: Container[] = [];
  for (let index = 0; index < 16; index += 1) {
    const consignee = pick([P.alfuttaim, P.lulu, P.alghurair, P.rakCeramics, P.emiratesSteel, P.sharjahCement]);
    const isReefer = index === 3 || index === 9;
    aegeanBoxes.push(terminal.registerContainer(ctx(E.priya, at(3, 10)), { number: num('HLCU'), size: index % 3 === 0 ? '20' : '40', type: isReefer ? 'RF' : index % 5 === 0 ? 'HC' : 'GP', category: index < 12 ? 'import' : 'transhipment', full: true, lineId: P.hapag.id, consigneeId: index < 12 ? consignee.id : null, clearingAgentId: index < 12 ? pick([P.alNahdi, P.gulfBrokers, P.momentumFf]).id : null, commodity: index < 12 ? pick(commodities) : 'Transhipment to Jubail', grossWeightKg: 15000 + Math.floor(random() * 12000), sealNumber: `HL${Math.floor(random() * 900000 + 100000)}`, dg: index === 7 ? { imoClass: '3', unNumber: 'UN1263' } : null, oog: false, reefer: isReefer ? { setpointC: index === 3 ? 4 : -20 } : null, inboundCallId: aegean.id }));
  }
  shared.ingestIntegrationEvent(ctx(E.integration, at(2, 8)), { provider: 'Hapag-Lloyd EDI', eventId: 'HL-BAPLIE-0391W-01', type: 'BAPLIE', subject: 'AGEX0391W' });
  shared.addDocument(ctx(E.fatima, at(2, 9)), { type: 'Dangerous goods declaration', title: 'DG declaration AEGEAN EXPRESS AGEX0391W', vesselCallId: aegean.id, file: { fileName: 'DGD_AGEX0391W.pdf', sizeBytes: 220144, mimeType: 'application/pdf', checksum: 'c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8' }, note: 'One IMO class 3 unit on board', legallySignificant: true, retentionYears: 7, access: [] });
  shared.ingestIntegrationEvent(ctx(E.integration, at(2, 8, 5)), { provider: 'Hapag-Lloyd EDI', eventId: 'HL-BAPLIE-0391W-01', type: 'BAPLIE', subject: 'AGEX0391W' });
  terminal.recordPreArrival(ctx(E.fatima, at(2, 9)), { callId: aegean.id, doc: 'loadList' });
  terminal.recordPreArrival(ctx(E.fatima, at(3, 9)), { callId: aegean.id, notice: 'h72' });
  terminal.recordPreArrival(ctx(E.fatima, at(2, 9)), { callId: aegean.id, notice: 'h48' });
  terminal.recordPreArrival(ctx(E.fatima, at(1, 9)), { callId: aegean.id, notice: 'h24' });
  terminal.berthVessel(ctx(E.omar, at(0, 23 - 24, 10)), { callId: aegean.id });
  terminal.startVesselOperations(ctx(E.omar, at(0, 23 - 24, 45)), { callId: aegean.id });
  const nowHour = new Date(base).getUTCHours();
  aegeanBoxes.slice(0, 9).forEach((container, index) => {
    terminal.dischargeContainer(ctx(E.omar, at(0, Math.max(0, Math.min(nowHour, index)), 20)), { callId: aegean.id, containerId: container.id, yardPosition: positions(container.category === 'transhipment' ? 'T' : container.reefer ? 'R' : 'B'), idempotencyKey: key() });
  });
  terminal.reeferCheck(ctx(E.omar, at(0, Math.max(0, nowHour - 1), 5)), { containerId: aegeanBoxes[3].id, temperatureC: 4.5, plugged: true });
  shared.ingestIntegrationEvent(ctx(E.integration, at(0, Math.max(0, nowHour - 1), 30)), { provider: 'Sharjah Customs', eventId: 'SC-2026-118204', type: 'CUSTOMS_CLEARANCE', subject: aegeanBoxes[0].number, payload: { status: 'cleared' } });
  shared.ingestIntegrationEvent(ctx(E.integration, at(0, Math.max(0, nowHour - 1), 31)), { provider: 'Sharjah Customs', eventId: 'SC-2026-118209', type: 'CUSTOMS_CLEARANCE', subject: aegeanBoxes[1].number, payload: { status: 'cleared' } });
  try {
    shared.ingestIntegrationEvent(ctx(E.integration, at(0, Math.max(0, nowHour - 1), 32)), { provider: 'Sharjah Customs', eventId: 'SC-2026-118211', type: 'CUSTOMS_CLEARANCE', subject: 'HLCU0000000', payload: { status: 'cleared' } });
  } catch (error) {
    if (error instanceof shared.IntegrationFailure) db.integrations.push({ ...error.record, status: 'failed', detail: error.message });
  }

  /* ---------------------------------------------------------- Story 4: JENS MAERSK expected in two days, export gate open */
  const jens = terminal.createVesselCall(ctx(E.priya, at(8, 9)), { voyage: 'JEMK641W', vessel: 'JENS MAERSK', lineId: P.maersk.id, terminalId: 'loc-kct', berth: '4', service: 'ME7', eta: at(-2, 4), etb: at(-2, 6), etd: at(-3, 2), plannedDischarge: 420, plannedLoad: 260, cranesAllocated: 4 });
  terminal.recordPreArrival(ctx(E.fatima, at(1, 9)), { callId: jens.id, notice: 'h72' });
  const jensExports: Container[] = [];
  for (let index = 0; index < 6; index += 1) {
    jensExports.push(terminal.registerContainer(ctx(E.fatima, at(4, 11)), { number: num('MAEU'), size: index < 4 ? '20' : '40', type: index === 5 ? 'HC' : 'GP', category: 'export', full: true, lineId: P.maersk.id, shipperName: index < 4 ? P.ega.name : P.rakCeramics.name, commodity: index < 4 ? 'Aluminium billets' : 'Ceramic tiles', grossWeightKg: index < 4 ? 27900 : 26100, sealNumber: `${index < 4 ? 'EGA' : 'RAK'}${2200 + index}`, outboundCallId: jens.id }));
  }
  for (const [index, container] of jensExports.slice(0, 3).entries()) {
    const token = terminal.generateToken(ctx(E.portal, at(1, 9)), { containerId: container.id, type: 'export_dropoff', haulierId: P.momentumTpt.id, truckPlate: `SHJ ${41300 + index}`, driverName: pick(['Ravi Kumar', 'Mohammed Saleh', 'Arun Pillai']), slotStart: at(1, 10 + index), onBehalfOf: P.ega.name });
    terminal.marshallingYardArrival(ctx(E.khalid, at(1, 10 + index, 8)), { tokenId: token.id });
    terminal.gateIn(ctx(E.khalid, at(1, 10 + index, 22)), { tokenId: token.id, yardPosition: positions('E'), sealVerified: true, damageRemarks: '', vgmKg: 27820 + index * 30, idempotencyKey: key() });
    terminal.updateCustoms(ctx(E.fatima, at(1, 14)), { containerId: container.id, status: 'cleared', reference: `SHJ-EXP-${77300 + index}` });
  }
  terminal.generateToken(ctx(E.portal, at(0, Math.max(0, nowHour - 2))), { containerId: jensExports[3].id, type: 'export_dropoff', haulierId: P.momentumTpt.id, truckPlate: 'SHJ 41303', driverName: 'Tariq Aziz', slotStart: at(0, Math.min(23, nowHour + 2)), onBehalfOf: P.ega.name });

  // Empties in the KCT yard: returned after import deliveries, one booked for empty release.
  const empties: Container[] = [];
  for (let index = 0; index < 5; index += 1) {
    const container = terminal.registerContainer(ctx(E.khalid, at(3, 9)), { number: num(index < 3 ? 'MSCU' : 'MAEU'), size: index % 2 ? '40' : '20', type: 'GP', category: 'empty', full: false, lineId: index < 3 ? P.msc.id : P.maersk.id, commodity: '', grossWeightKg: index % 2 ? 3800 : 2250, sealNumber: '', outboundCallId: index < 3 ? jens.id : null });
    // Registered as expected; bring them into the yard through an empty return token.
    container.status = 'on_truck';
    container.locationId = 'loc-kct';
    const token = terminal.generateToken(ctx(E.portal, at(3, 9, 30)), { containerId: container.id, type: 'empty_return', haulierId: P.sahraa.id, truckPlate: `DXB ${77900 + index}`, driverName: 'Mohammed Saleh', slotStart: at(3, 11 + index), onBehalfOf: P.sahraa.name });
    terminal.gateIn(ctx(E.khalid, at(3, 11 + index, 14)), { tokenId: token.id, yardPosition: positions('M'), sealVerified: false, damageRemarks: index === 4 ? 'Floor damage, for repair' : '', idempotencyKey: key() });
    empties.push(container);
  }
  terminal.generateToken(ctx(E.portal, at(0, Math.max(0, nowHour - 1))), { containerId: empties[1].id, type: 'empty_release', haulierId: P.emiratesTpt.id, truckPlate: 'AUH 31044', driverName: 'Arun Pillai', slotStart: at(0, Math.min(23, nowHour + 3)), onBehalfOf: P.emiratesTpt.name });

  /* ---------------------------------------------------------- Story 5: Sharjah Container Terminal, CMA CGM TAGE expected */
  terminal.createVesselCall(ctx(E.priya, at(5, 9)), { voyage: 'CMTG118E', vessel: 'CMA CGM TAGE', lineId: P.cma.id, terminalId: 'loc-sct', berth: '1', service: 'Gulf Express', eta: at(-5, 12), etb: at(-5, 14, 30), etd: at(-6, 8), plannedDischarge: 180, plannedLoad: 120, cranesAllocated: 2 });
  const elba = terminal.createVesselCall(ctx(E.priya, at(20, 9)), { voyage: 'MAEL556W', vessel: 'MAERSK ELBA', lineId: P.maersk.id, terminalId: 'loc-sct', berth: '2', service: 'ME7', eta: at(13, 7), etb: at(13, 9), etd: at(12, 6), plannedDischarge: 4, plannedLoad: 0, cranesAllocated: 2 });
  const elbaBoxes: Container[] = [];
  for (let index = 0; index < 4; index += 1) {
    elbaBoxes.push(terminal.registerContainer(ctx(E.priya, at(15, 10)), { number: num('MAEU'), size: '40', type: 'HC', category: 'import', full: true, lineId: P.maersk.id, consigneeId: index < 2 ? P.lulu.id : P.alghurair.id, clearingAgentId: P.gulfBrokers.id, commodity: index < 2 ? 'Textiles' : 'Beverages', grossWeightKg: 21400, sealNumber: `ML${500100 + index}`, inboundCallId: elba.id }));
  }
  terminal.recordPreArrival(ctx(E.fatima, at(14, 9)), { callId: elba.id, doc: 'bayPlan' });
  terminal.recordPreArrival(ctx(E.fatima, at(14, 9)), { callId: elba.id, doc: 'dischargeList' });
  terminal.berthVessel(ctx(E.omar, at(13, 9, 5)), { callId: elba.id });
  terminal.startVesselOperations(ctx(E.omar, at(13, 9, 40)), { callId: elba.id });
  elbaBoxes.forEach((container, index) => terminal.dischargeContainer(ctx(E.omar, at(13, 11, index * 15)), { callId: elba.id, containerId: container.id, yardPosition: positions('S'), idempotencyKey: key() }));
  terminal.completeVesselOperations(ctx(E.omar, at(12, 4)), { callId: elba.id });
  terminal.departVessel(ctx(E.omar, at(12, 6, 30)), { callId: elba.id });
  for (const [index, container] of elbaBoxes.slice(0, 3).entries()) {
    clearAndPay(container, at(11 - index, 10), `DO-${54100 + index}`, 10 - index, `SHJ-IMP-88100${index}`);
    terminal.assignHaulier(ctx(E.portal, at(10 - index, 9)), { containerId: container.id, haulierId: P.momentumTpt.id, onBehalfOf: db.parties.find(p => p.id === container.consigneeId)!.name });
    const token = terminal.generateToken(ctx(E.portal, at(10 - index, 9, 30)), { containerId: container.id, type: 'import_pickup', truckPlate: `SHJ ${52310 + index}`, driverName: 'Ravi Kumar', slotStart: at(10 - index, 13), onBehalfOf: db.parties.find(p => p.id === container.consigneeId)!.name });
    terminal.gateOut(ctx(E.omar, at(10 - index, 13, 20)), { tokenId: token.id, sealVerified: true, damageRemarks: '', idempotencyKey: key() });
  }
  // The fourth ELBA box: cleared, delivery order on file, payment outstanding (invoice issued, unpaid and now overdue).
  terminal.updateCustoms(ctx(E.fatima, at(9, 10)), { containerId: elbaBoxes[3].id, status: 'cleared', reference: 'SHJ-IMP-88104' });
  terminal.recordDeliveryOrder(ctx(E.fatima, at(9, 10)), { containerId: elbaBoxes[3].id, number: 'DO-54104', validUntil: at(-20), issuedBy: 'Maersk Sharjah agency' });
  finance.collectContainerCharges(ctx(E.portal, at(8, 10)), { containerId: elbaBoxes[3].id, expectedExit: at(-4), payableAmount: 0, cardReference: '', onBehalfOf: P.alghurair.name });

  /* ---------------------------------------------------------- Story 6: Iraq Container Terminal and Umm Qasr Logistics Centre */
  const basra = terminal.createVesselCall(ctx(E.ali, at(16, 9)), { voyage: 'GTHZ006N', vessel: 'GT HORMUZ', lineId: P.gtlines.id, terminalId: 'loc-ict', berth: '11', service: 'UAE to Umm Qasr feeder', eta: at(9, 5), etb: at(9, 7), etd: at(8, 12), plannedDischarge: 3, plannedLoad: 0, cranesAllocated: 2 });
  const basraBoxes: Container[] = [];
  for (let index = 0; index < 3; index += 1) basraBoxes.push(terminal.registerContainer(ctx(E.ali, at(12, 10)), { number: num('GTLU'), size: '40', type: 'GP', category: 'import', full: true, lineId: P.gtlines.id, consigneeId: P.basraTrading.id, clearingAgentId: P.momentumFf.id, commodity: pick(commodities), grossWeightKg: 22000, sealNumber: `GT${300100 + index}`, inboundCallId: basra.id }));
  terminal.recordPreArrival(ctx(E.ali, at(10, 9)), { callId: basra.id, doc: 'bayPlan' });
  terminal.recordPreArrival(ctx(E.ali, at(10, 9)), { callId: basra.id, doc: 'dischargeList' });
  terminal.berthVessel(ctx(E.ali, at(9, 7, 10)), { callId: basra.id });
  terminal.startVesselOperations(ctx(E.ali, at(9, 8)), { callId: basra.id });
  basraBoxes.forEach((container, index) => terminal.dischargeContainer(ctx(E.ali, at(9, 9, index * 20)), { callId: basra.id, containerId: container.id, yardPosition: positions('A'), idempotencyKey: key() }));
  terminal.completeVesselOperations(ctx(E.ali, at(8, 10)), { callId: basra.id });
  terminal.departVessel(ctx(E.ali, at(8, 12, 30)), { callId: basra.id });
  terminal.updateCustoms(ctx(E.ali, at(6, 10)), { containerId: basraBoxes[0].id, status: 'cleared', reference: 'GCPI-55120' });
  terminal.createVesselCall(ctx(E.ali, at(3, 9)), { voyage: 'GTHZ007N', vessel: 'GT HORMUZ', lineId: P.gtlines.id, terminalId: 'loc-ict', berth: '11', service: 'UAE to Umm Qasr feeder', eta: at(-1, 5), etb: at(-1, 7), etd: at(-2, 12), plannedDischarge: 4, plannedLoad: 2, cranesAllocated: 2 });

  /* ---------------------------------------------------------- Story 7: Jeddah and Canaveral */
  const lyric = terminal.createVesselCall(ctx(E.noura, at(7, 9)), { voyage: 'EVLY0228W', vessel: 'EVER LYRIC', lineId: P.evergreen.id, terminalId: 'loc-nct', berth: '3', service: 'Red Sea service', eta: at(1, 2), etb: at(1, 4), etd: at(-1, 14), plannedDischarge: 6, plannedLoad: 4, cranesAllocated: 3 });
  const lyricBoxes: Container[] = [];
  for (let index = 0; index < 6; index += 1) lyricBoxes.push(terminal.registerContainer(ctx(E.noura, at(4, 10)), { number: num('EGHU'), size: index % 2 ? '40' : '20', type: 'GP', category: 'import', full: true, lineId: P.evergreen.id, consigneeId: P.jubailPetro.id, clearingAgentId: null, commodity: 'Polymer resin', grossWeightKg: 24000, sealNumber: `EG${410200 + index}`, inboundCallId: lyric.id }));
  terminal.recordPreArrival(ctx(E.noura, at(3, 9)), { callId: lyric.id, doc: 'bayPlan' });
  terminal.recordPreArrival(ctx(E.noura, at(3, 9)), { callId: lyric.id, doc: 'dischargeList' });
  terminal.recordPreArrival(ctx(E.noura, at(3, 9)), { callId: lyric.id, doc: 'loadList' });
  terminal.berthVessel(ctx(E.noura, at(1, 4, 20)), { callId: lyric.id });
  terminal.startVesselOperations(ctx(E.noura, at(1, 5)), { callId: lyric.id });
  lyricBoxes.slice(0, 3).forEach((container, index) => terminal.dischargeContainer(ctx(E.noura, at(1, 6 + index)), { callId: lyric.id, containerId: container.id, yardPosition: positions('J'), idempotencyKey: key() }));

  const atlantic = terminal.createVesselCall(ctx(E.james, at(9, 9)), { voyage: 'ATST2203', vessel: 'ATLANTIC STAR', lineId: P.hapag.id, terminalId: 'loc-cct', berth: '1', service: 'Caribbean feeder', eta: at(3, 10), etb: at(3, 12), etd: at(2, 18), plannedDischarge: 4, plannedLoad: 0, cranesAllocated: 1 });
  const atlanticBoxes: Container[] = [];
  for (let index = 0; index < 4; index += 1) atlanticBoxes.push(terminal.registerContainer(ctx(E.james, at(6, 10)), { number: num('HLCU'), size: '40', type: index < 2 ? 'RF' : 'HC', category: 'import', full: true, lineId: P.hapag.id, consigneeId: P.floridaFresh.id, clearingAgentId: null, commodity: index < 2 ? 'Fresh pineapples' : 'Canned fruit', grossWeightKg: 23000, sealNumber: `HL${720400 + index}`, reefer: index < 2 ? { setpointC: 8 } : null, inboundCallId: atlantic.id }));
  terminal.recordPreArrival(ctx(E.james, at(5, 9)), { callId: atlantic.id, doc: 'bayPlan' });
  terminal.recordPreArrival(ctx(E.james, at(5, 9)), { callId: atlantic.id, doc: 'dischargeList' });
  terminal.berthVessel(ctx(E.james, at(3, 12, 5)), { callId: atlantic.id });
  terminal.startVesselOperations(ctx(E.james, at(3, 12, 30)), { callId: atlantic.id });
  atlanticBoxes.forEach((container, index) => terminal.dischargeContainer(ctx(E.james, at(3, 13 + index)), { callId: atlantic.id, containerId: container.id, yardPosition: positions('F'), idempotencyKey: key() }));
  terminal.completeVesselOperations(ctx(E.james, at(2, 17)), { callId: atlantic.id });
  terminal.departVessel(ctx(E.james, at(2, 18, 30)), { callId: atlantic.id });
  for (const [index, container] of atlanticBoxes.slice(0, 2).entries()) {
    terminal.updateCustoms(ctx(E.james, at(2, 8)), { containerId: container.id, status: 'cleared', reference: `CBP-ENTRY-${31000 + index}` });
    terminal.recordDeliveryOrder(ctx(E.james, at(2, 8)), { containerId: container.id, number: `DO-US-${8800 + index}`, validUntil: at(-8), issuedBy: 'Hapag-Lloyd Jacksonville' });
    finance.collectContainerCharges(ctx(E.portal, at(2, 9)), { containerId: container.id, expectedExit: at(1), payableAmount: 999999, cardReference: `AUTH${7100200 + index}`, onBehalfOf: P.floridaFresh.name });
  }

  /* ---------------------------------------------------------- Story 8: Momentum contract logistics */
  const S = {
    dove: warehouse.createSku(ctx(E.rahul, at(200)), { code: 'UNL-DOVE-24', name: 'Dove bar soap, 24 x 100 g', description: 'Retail cartons', customerId: P.unilever.id, category: 'FMCG', unit: 'cartons', weightKg: 2.6, handling: ['Keep dry'] }),
    lipton: warehouse.createSku(ctx(E.rahul, at(200)), { code: 'UNL-LIPT-100', name: 'Lipton Yellow Label, 100 tea bags', description: 'Retail cartons of 12', customerId: P.unilever.id, category: 'FMCG', unit: 'cartons', weightKg: 3.1, handling: ['Keep dry', 'Odour sensitive'] }),
    omo: warehouse.createSku(ctx(E.rahul, at(200)), { code: 'UNL-OMO-5KG', name: 'OMO detergent 5 kg', description: 'Pallets of 96', customerId: P.unilever.id, category: 'FMCG', unit: 'pallets', weightKg: 520, handling: ['Do not stack more than 2'] }),
    brakes: warehouse.createSku(ctx(E.rahul, at(190)), { code: 'AFM-BRK-TOY-01', name: 'Brake pad set, Toyota Land Cruiser', description: 'Genuine parts, boxed', customerId: P.afMotors.id, category: 'Automotive', unit: 'units', weightKg: 4.2, handling: [] }),
    filters: warehouse.createSku(ctx(E.rahul, at(190)), { code: 'AFM-FLT-OIL-02', name: 'Oil filter, 2.7 L engines', description: 'Boxes of 24', customerId: P.afMotors.id, category: 'Automotive', unit: 'cartons', weightKg: 9.8, handling: [] }),
    batteries: warehouse.createSku(ctx(E.rahul, at(190)), { code: 'AFM-BAT-70AH', name: 'Lead-acid battery 70 Ah', description: 'Pallets of 40', customerId: P.afMotors.id, category: 'Automotive', unit: 'pallets', weightKg: 760, handling: ['Hazardous, class 8', 'Upright only'] }),
    chemicals: warehouse.createSku(ctx(E.rahul, at(180)), { code: 'SLB-CHM-DRM-200', name: 'Drilling fluid additive, 200 L drum', description: 'UN1760 corrosive', customerId: P.schlumberger.id, category: 'Oil and gas', unit: 'units', weightKg: 240, handling: ['Hazardous, class 8', 'Bonded'] }),
    valves: warehouse.createSku(ctx(E.rahul, at(180)), { code: 'SLB-VLV-6IN', name: 'Wellhead valve assembly, 6 inch', description: 'Crated', customerId: P.schlumberger.id, category: 'Oil and gas', unit: 'units', weightKg: 310, handling: ['Crane lift'] }),
    rice: warehouse.createSku(ctx(E.rahul, at(170)), { code: 'CRF-RICE-10', name: 'Basmati rice 10 kg', description: 'Pallets of 80 bags', customerId: P.carrefour.id, category: 'Retail', unit: 'pallets', weightKg: 820, handling: ['Food grade'] }),
    water: warehouse.createSku(ctx(E.rahul, at(170)), { code: 'CRF-WTR-1.5', name: 'Bottled water 1.5 L, 6-pack', description: 'Pallets of 84', customerId: P.carrefour.id, category: 'Retail', unit: 'pallets', weightKg: 780, handling: ['Food grade'] }),
  };

  function inbound(time: string, customer: Party, locationId: string, reference: string, lines: { sku: typeof S[keyof typeof S]; qty: number; received?: number; damaged?: number }[], worker: Employee) {
    const order = warehouse.createWarehouseOrder(ctx(E.rahul, time), { type: 'inbound', customerId: customer.id, locationId, customerReference: reference, expectedAt: time, lines: lines.map(line => ({ skuId: line.sku.id, quantity: line.qty })) });
    const received = new Date(new Date(time).getTime() + 5 * HOUR).toISOString();
    warehouse.receiveOrder(ctx(worker, received), { orderId: order.id, lines: lines.map(line => ({ skuId: line.sku.id, actualQty: line.received ?? line.qty, damagedQty: line.damaged ?? 0 })), notes: '', idempotencyKey: key() });
    return order;
  }
  inbound(at(40, 8), P.unilever, 'loc-siw', 'UNL-ASN-77120', [{ sku: S.dove, qty: 1200 }, { sku: S.lipton, qty: 800 }, { sku: S.omo, qty: 60 }], E.daniel);
  inbound(at(32, 8), P.afMotors, 'loc-sjw', 'AFM-PO-30911', [{ sku: S.brakes, qty: 400 }, { sku: S.filters, qty: 250 }, { sku: S.batteries, qty: 24 }], E.daniel);
  inbound(at(25, 8), P.carrefour, 'loc-sjw', 'CRF-DC-5582', [{ sku: S.rice, qty: 120 }, { sku: S.water, qty: 150 }], E.daniel);
  inbound(at(18, 8), P.schlumberger, 'loc-siw', 'SLB-INB-2271', [{ sku: S.chemicals, qty: 80, damaged: 2 }, { sku: S.valves, qty: 12 }], E.maria);
  inbound(at(6, 8), P.unilever, 'loc-siw', 'UNL-ASN-77188', [{ sku: S.dove, qty: 600, received: 588 }, { sku: S.omo, qty: 40 }], E.daniel);
  inbound(at(9, 8), P.carrefour, 'loc-sjw', 'CRF-DC-5610', [{ sku: S.water, qty: 100 }], E.daniel);
  // Expected inbound, not yet received.
  warehouse.createWarehouseOrder(ctx(E.rahul, at(1, 9)), { type: 'inbound', customerId: P.afMotors.id, locationId: 'loc-sjw', customerReference: 'AFM-PO-31002', expectedAt: at(-1, 9), lines: [{ skuId: S.brakes.id, quantity: 300 }, { skuId: S.filters.id, quantity: 120 }] });

  // Outbound flows.
  const out1 = warehouse.createWarehouseOrder(ctx(E.rahul, at(12, 9)), { type: 'outbound', customerId: P.unilever.id, locationId: 'loc-siw', customerReference: 'UNL-SO-91011 Carrefour Sharjah', expectedAt: at(11, 9), lines: [{ skuId: S.dove.id, quantity: 300 }, { skuId: S.lipton.id, quantity: 200 }] });
  warehouse.allocateOrder(ctx(E.rahul, at(12, 10)), { orderId: out1.id });
  warehouse.pickOrder(ctx(E.daniel, at(11, 8)), { orderId: out1.id, lines: [{ skuId: S.dove.id, pickedQty: 300 }, { skuId: S.lipton.id, pickedQty: 200 }], idempotencyKey: key() });
  const out1Job = logistics.createTransportJob(ctx(E.hassan, at(11, 9)), { type: 'warehouse_distribution', fromLocationId: 'loc-siw', toLocationId: null, customerId: P.unilever.id, destinationAddress: 'Carrefour DC, Sharjah Industrial Area 13', containerIds: [], warehouseOrderId: out1.id, tractor: 'SHJ 48110', trailer: 'TR-301', driverName: 'Arun Pillai', scheduledAt: at(11, 10) });
  logistics.startTransportJob(ctx(E.hassan, at(11, 10, 15)), { jobId: out1Job.id });
  logistics.completeTransportJob(ctx(E.hassan, at(11, 12, 40)), { jobId: out1Job.id, receivedBy: 'K. Thomas, receiving', note: '' });

  const out2 = warehouse.createWarehouseOrder(ctx(E.rahul, at(2, 9)), { type: 'outbound', customerId: P.afMotors.id, locationId: 'loc-sjw', customerReference: 'AFM-SO-44120 Dubai Festival City', expectedAt: at(1, 9), lines: [{ skuId: S.brakes.id, quantity: 120 }, { skuId: S.filters.id, quantity: 60 }, { skuId: S.batteries.id, quantity: 6 }] });
  warehouse.allocateOrder(ctx(E.rahul, at(2, 10)), { orderId: out2.id });
  warehouse.pickOrder(ctx(E.daniel, at(1, 8)), { orderId: out2.id, lines: [{ skuId: S.brakes.id, pickedQty: 120 }, { skuId: S.filters.id, pickedQty: 58 }, { skuId: S.batteries.id, pickedQty: 6 }], notes: 'Two filter cartons found crushed, left in damage bay', idempotencyKey: key() });
  const out2Job = logistics.createTransportJob(ctx(E.hassan, at(1, 9)), { type: 'warehouse_distribution', fromLocationId: 'loc-sjw', toLocationId: null, customerId: P.afMotors.id, destinationAddress: 'Al-Futtaim Motors parts centre, Dubai Festival City', containerIds: [], warehouseOrderId: out2.id, tractor: 'SHJ 48112', trailer: 'TR-305', driverName: 'Tariq Aziz', scheduledAt: at(0, Math.max(0, nowHour - 1)) });
  logistics.startTransportJob(ctx(E.hassan, at(0, Math.max(0, nowHour - 1), 20)), { jobId: out2Job.id });

  const out3 = warehouse.createWarehouseOrder(ctx(E.rahul, at(1, 11)), { type: 'outbound', customerId: P.carrefour.id, locationId: 'loc-sjw', customerReference: 'CRF-SO-7781 Carrefour Ajman', expectedAt: at(-1, 9), lines: [{ skuId: S.rice.id, quantity: 40 }, { skuId: S.water.id, quantity: 60 }] });
  warehouse.allocateOrder(ctx(E.rahul, at(1, 11, 30)), { orderId: out3.id });
  warehouse.createWarehouseOrder(ctx(E.rahul, at(0, Math.max(0, nowHour - 4))), { type: 'outbound', customerId: P.schlumberger.id, locationId: 'loc-siw', customerReference: 'SLB-SO-5520 Rig 14, Ruwais', expectedAt: at(-2, 9), lines: [{ skuId: S.chemicals.id, quantity: 30 }, { skuId: S.valves.id, quantity: 4 }] });

  // Transfer, hold, adjustments, reversal.
  warehouse.transferStock(ctx(E.maria, at(5, 10)), { skuId: S.omo.id, fromLocationId: 'loc-siw', toLocationId: 'loc-sjw', qty: 20, reason: 'Balance stock for Sajaa deliveries', idempotencyKey: key() });
  warehouse.holdStock(ctx(E.rahul, at(4, 10)), { skuId: S.lipton.id, locationId: 'loc-siw', qty: 50, reason: 'Batch 2271 on quality hold pending customer release' });
  warehouse.requestAdjustment(ctx(E.rahul, at(7, 14)), { skuId: S.dove.id, locationId: 'loc-siw', bucket: 'available', delta: -12, reason: 'Cycle count 7 October: 12 cartons short in bay A4' });
  const pendingApproval = warehouse.requestAdjustment(ctx(E.maria, at(1, 16)), { skuId: S.rice.id, locationId: 'loc-sjw', bucket: 'available', delta: -30, reason: 'Water damage after sprinkler test, 30 pallets written off' });
  void pendingApproval;
  const countAdj = warehouse.requestAdjustment(ctx(E.rahul, at(3, 15)), { skuId: S.filters.id, locationId: 'loc-sjw', bucket: 'available', delta: 10, reason: 'Found 10 cartons mislocated in bay C2' });
  warehouse.reverseMovement(ctx(E.rahul, at(3, 16)), { movementId: countAdj.movementId!, reason: 'Cartons belonged to the AFM-PO-31002 pre-receipt, counted twice' });
  warehouse.requestAdjustment(ctx(E.rahul, at(3, 16, 30)), { skuId: S.chemicals.id, locationId: 'loc-siw', bucket: 'damaged', delta: -2, reason: 'Two damaged drums disposed through licensed contractor, certificate HW-2026-0410' });

  /* ---------------------------------------------------------- Finance: invoices to lines and the overdue consignee invoice */
  const mscCharges = db.charges.filter(charge => charge.partyId === P.msc.id && !charge.invoiceId && charge.vesselCallId === aurora.id);
  const mscInvoice = finance.createInvoice(ctx(E.lucas, at(7, 15)), { partyId: P.msc.id, chargeIds: mscCharges.map(charge => charge.id), dueDays: 30, issue: true });
  finance.recordPayment(ctx(E.lucas, at(2, 11)), { invoiceId: mscInvoice.id, amount: Math.round(mscInvoice.total * 0.6 * 100) / 100, method: 'bank_transfer', reference: 'TT-MSC-2026-10-7781' });
  shared.ingestIntegrationEvent(ctx(E.integration, at(7, 15, 5)), { provider: 'SAP S/4HANA', eventId: `SAP-${mscInvoice.reference}`, type: 'SAP_POSTING', subject: mscInvoice.reference });
  const maerskCharges = db.charges.filter(charge => charge.partyId === P.maersk.id && !charge.invoiceId && charge.vesselCallId === elba.id);
  finance.createInvoice(ctx(E.lucas, at(11, 15)), { partyId: P.maersk.id, chargeIds: maerskCharges.map(charge => charge.id), dueDays: 30, issue: true });
  const mlCharges = db.charges.filter(charge => charge.partyId === P.momentumTpt.id && !charge.invoiceId);
  finance.createInvoice(ctx(E.lucas, at(5, 15)), { partyId: P.momentumTpt.id, chargeIds: mlCharges.map(charge => charge.id), dueDays: 15, issue: false });
  const unileverCharges = db.charges.filter(charge => charge.partyId === P.unilever.id && !charge.invoiceId);
  const unileverInvoice = finance.createInvoice(ctx(E.lucas, at(10, 15)), { partyId: P.unilever.id, chargeIds: unileverCharges.map(charge => charge.id), dueDays: 30, issue: true });
  finance.recordPayment(ctx(E.lucas, at(3, 11)), { invoiceId: unileverInvoice.id, amount: unileverInvoice.total, method: 'bank_transfer', reference: 'TT-UNL-2026-10-0412' });

  // Tasks for today.
  shared.createTask(ctx(E.omar, at(0, Math.max(0, nowHour - 2))), { title: `Reefer round, block R: ${db.containers.filter(c => c.reefer && c.status === 'in_yard' && c.locationId === 'loc-kct').length} units`, type: 'reefer_check', locationId: 'loc-kct', priority: 'high', dueAt: at(0, Math.min(23, nowHour + 2)) });
  shared.createTask(ctx(E.omar, at(0, Math.max(0, nowHour - 2))), { title: `Plan inland transfer for ${rak1.number} (uncollected)`, type: 'transfer', locationId: 'loc-kct', priority: 'normal', dueAt: at(-1, 9), refKind: 'container', refId: rak1.id });
  shared.createTask(ctx(E.maria, at(0, Math.max(0, nowHour - 3))), { title: 'Cycle count, Unilever bays A1 to A6', type: 'stock_count', locationId: 'loc-siw', priority: 'normal', dueAt: at(-1, 12), assigneeId: E.daniel.id });

  // Offline queue: a gate-out captured while the KCT gate tablet was offline, plus one that will be rejected.
  shared.enqueueOffline(ctx(E.khalid, at(0, Math.max(0, nowHour - 1), 10)), { kind: 'yard_shift', summary: `${aegeanBoxes[2].number} to B07-3-2 (housekeeping)`, payload: { containerId: aegeanBoxes[2].id, toPosition: 'B07-3-2', purpose: 'other', idempotencyKey: newId() } });
  shared.enqueueOffline(ctx(E.khalid, at(0, Math.max(0, nowHour - 1), 12)), { kind: 'yard_shift', summary: `${afl1.number} to C02-1-1 (housekeeping)`, payload: { containerId: afl1.id, toPosition: 'C02-1-1', purpose: 'other', idempotencyKey: newId() } });

  // Housekeeping sweep as the scheduler would have run it.
  shared.runHousekeeping(ctx(E.ayesha, now));
  shared.processOutbox(db, now);

  // Everyone has read the older notifications; the last day stays unread.
  const dayAgo = new Date(base.getTime() - DAY).toISOString();
  for (const notification of db.notifications) if (notification.createdAt < dayAgo) notification.readBy = db.employees.map(employee => employee.id);

  return db;
}
