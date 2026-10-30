/*
 * Domain model for the Gulftainer operations platform.
 *
 * Modelled on how Gulftainer actually operates (sources: gulftainer.com, the KCT
 * Schedule of Charges effective 1 June 2026, the 2026 customer advisories and the
 * Marshall Yard E-Token portal manual):
 *
 *  - GT Ports: container terminals (KCT, SCT, Iraq Container Terminal, GSCCO terminals,
 *    GT USA) handling import, export, transhipment and empty containers through vessel
 *    calls, the container yard and the gate, with holds, customs clearance, delivery
 *    orders, e-tokens (truck appointments) and tariff-based storage.
 *  - GT Logistics / Momentum: inland container depots (SICD, Sajaa bonded dry port,
 *    Umm Qasr Logistics Centre), contract-logistics warehouses with SKU inventory,
 *    and the truck fleet.
 *  - Finance: service charges per the tariff, invoices per party and online payment.
 *
 * Everything lives in one `OpsDB` document persisted to localStorage (store.ts).
 */

export type ISODate = string;

/* ============================================================ Organisation & people */

export type LocationType = 'terminal' | 'inland_depot' | 'logistics_centre' | 'warehouse';

export interface Organization {
  id: string;
  code: string;
  name: string;
  country: string;
  /** GT Ports, GT Logistics (Momentum), GT Maritime (GT Lines) */
  platform: 'GT Ports' | 'GT Logistics' | 'GT Maritime';
}

export interface Location {
  id: string;
  orgId: string;
  code: string;
  name: string;
  type: LocationType;
  country: string;
  city: string;
  timezone: string;
  operatingHours: string;
  bonded: boolean;
  /** Terminal and depot facts used by reports. */
  berths?: number;
  quayLengthM?: number;
  draftM?: number;
  yardCapacityTeu?: number;
  reeferPlugs?: number;
  warehouseSqm?: number;
  active: boolean;
}

export type Role =
  | 'system_admin'
  | 'terminal_ops'
  | 'planner'
  | 'gate_officer'
  | 'customer_service'
  | 'warehouse_worker'
  | 'warehouse_supervisor'
  | 'inventory_manager'
  | 'transport_manager'
  | 'finance_manager'
  | 'auditor';

export interface Employee {
  id: string;
  username: string;
  name: string;
  email: string;
  role: Role;
  orgId: string;
  /** Locations the employee may operate in. System administrators are unrestricted. */
  locationIds: string[];
  active: boolean;
  createdAt: ISODate;
}

/** External parties that appear on containers, charges and invoices. */
export type PartyType = 'shipping_line' | 'consignee' | 'clearing_agent' | 'haulier' | 'contract_customer' | 'shipper';

export interface Party {
  id: string;
  code: string;
  name: string;
  type: PartyType;
  country: string;
  email: string;
  /** Registered on the customer portal (required for online payment and e-tokens). */
  portalRegistered: boolean;
  creditTerms: number;
  active: boolean;
}

/* ============================================================ Vessel calls */

export type VesselCallStatus = 'expected' | 'berthed' | 'working' | 'completed' | 'departed';

export interface PreArrivalDocs {
  bayPlan: boolean;
  dischargeList: boolean;
  loadList: boolean;
  dgList: boolean;
  baplie: boolean;
}

export interface VesselCall {
  id: string;
  /** Voyage reference as shown on the vessel schedule, e.g. JEMK641W. */
  voyage: string;
  vessel: string;
  lineId: string;
  terminalId: string;
  berth: string;
  service: string;
  eta: ISODate;
  etb: ISODate;
  etd: ISODate;
  ata?: ISODate;
  atb?: ISODate;
  opsCompletedAt?: ISODate;
  atd?: ISODate;
  /** Export receiving window: trucks may drop export boxes between these times. */
  gateOpen: ISODate;
  gateClose: ISODate;
  status: VesselCallStatus;
  plannedDischarge: number;
  plannedLoad: number;
  discharged: number;
  loaded: number;
  restows: number;
  cranesAllocated: number;
  preArrival: PreArrivalDocs;
  /** 72h / 48h / 24h arrival notices received from the carrier. */
  notices: { h72: boolean; h48: boolean; h24: boolean };
  version: number;
  createdAt: ISODate;
  updatedAt: ISODate;
}

/* ============================================================ Containers */

export type ContainerCategory = 'import' | 'export' | 'transhipment' | 'empty';
export type ContainerSize = '20' | '40' | '45';
export type ContainerType = 'GP' | 'HC' | 'RF' | 'OT' | 'FR' | 'TK';
export type ContainerPhysicalStatus = 'expected' | 'in_yard' | 'on_truck' | 'on_vessel' | 'delivered';
export type CustomsStatus = 'not_required' | 'pending' | 'inspection' | 'cleared';
export type HoldType = 'customs' | 'shipping_line' | 'terminal' | 'dg' | 'documentation';

export interface Hold {
  id: string;
  type: HoldType;
  reason: string;
  placedBy: string;
  placedAt: ISODate;
  releasedBy?: string;
  releasedAt?: ISODate;
}

export interface Container {
  id: string;
  /** ISO 6346 number, e.g. MSKU8842107 (check digit validated on entry). */
  number: string;
  size: ContainerSize;
  type: ContainerType;
  category: ContainerCategory;
  full: boolean;
  lineId: string;
  consigneeId: string | null;
  clearingAgentId: string | null;
  shipperName: string;
  commodity: string;
  grossWeightKg: number;
  vgmKg: number | null;
  sealNumber: string;
  dg: { imoClass: string; unNumber: string } | null;
  oog: boolean;
  reefer: { setpointC: number; plugged: boolean } | null;
  status: ContainerPhysicalStatus;
  /** Where the box physically is when in a yard, or the last yard it left. */
  locationId: string | null;
  yardPosition: string | null;
  inboundCallId: string | null;
  outboundCallId: string | null;
  dischargedAt: ISODate | null;
  gateInAt: ISODate | null;
  gateOutAt: ISODate | null;
  loadedAt: ISODate | null;
  deliveredAt: ISODate | null;
  customsStatus: CustomsStatus;
  deliveryOrder: { number: string; validUntil: ISODate; issuedBy: string; receivedAt: ISODate } | null;
  holds: Hold[];
  /** Charges settled through the online payment screen; a condition for release. */
  chargesSettled: boolean;
  haulierId: string | null;
  tokenId: string | null;
  transportJobId: string | null;
  version: number;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type ContainerEventType =
  | 'registered' | 'discharged' | 'loaded' | 'shifted' | 'restowed' | 'gate_in' | 'gate_out'
  | 'hold_placed' | 'hold_released' | 'customs_update' | 'delivery_order' | 'charges_settled'
  | 'haulier_assigned' | 'token_generated' | 'token_cancelled' | 'inland_transfer_out' | 'inland_transfer_in'
  | 'reefer_check' | 'delivered' | 'inspection';

/** Append-only history of a container. Nothing here is ever edited. */
export interface ContainerEvent {
  id: string;
  containerId: string;
  type: ContainerEventType;
  at: ISODate;
  by: string;
  locationId: string | null;
  fromPosition?: string | null;
  toPosition?: string | null;
  note: string;
  refKind?: 'vessel_call' | 'token' | 'gate' | 'transfer' | 'transport_job' | 'hold' | 'document' | 'charge';
  refId?: string;
  idempotencyKey?: string;
}

/* ============================================================ Gate & e-tokens */

export type TokenType = 'import_pickup' | 'export_dropoff' | 'empty_return' | 'empty_release';
export type TokenStatus = 'generated' | 'at_marshalling_yard' | 'gated' | 'completed' | 'cancelled' | 'expired';

export interface EToken {
  id: string;
  number: string;
  type: TokenType;
  containerId: string;
  haulierId: string;
  truckPlate: string;
  driverName: string;
  locationId: string;
  slotStart: ISODate;
  slotEnd: ISODate;
  status: TokenStatus;
  feeAed: number;
  amendments: number;
  createdBy: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface GateTransaction {
  id: string;
  reference: string;
  direction: 'in' | 'out';
  locationId: string;
  containerId: string;
  tokenId: string | null;
  truckPlate: string;
  haulierId: string | null;
  at: ISODate;
  /** Equipment interchange: seal checked, damage remarks. */
  sealVerified: boolean;
  damageRemarks: string;
  /** Deliveries 22:00–06:00 and on holidays attract the overtime charge (tariff 21.1). */
  overtime: boolean;
  operatorId: string;
  idempotencyKey: string;
  syncedFromClientId?: string;
}

/* ============================================================ Inland transfers & transport */

export type InlandTransferStatus = 'planned' | 'in_transit' | 'received';

export interface InlandTransfer {
  id: string;
  reference: string;
  fromLocationId: string;
  toLocationId: string;
  containerIds: string[];
  receivedContainerIds: string[];
  reason: 'uncollected_3_days' | 'customer_request' | 'yard_capacity';
  status: InlandTransferStatus;
  transportJobId: string | null;
  createdBy: string;
  createdAt: ISODate;
  dispatchedAt?: ISODate;
  receivedAt?: ISODate;
}

export type TransportJobType = 'import_delivery' | 'export_collection' | 'inland_transfer' | 'empty_repositioning' | 'warehouse_distribution';
export type TransportJobStatus = 'planned' | 'assigned' | 'en_route' | 'delivered' | 'closed' | 'cancelled';

export interface TransportJob {
  id: string;
  reference: string;
  type: TransportJobType;
  fromLocationId: string | null;
  toLocationId: string | null;
  customerId: string | null;
  destinationAddress: string;
  containerIds: string[];
  warehouseOrderId: string | null;
  inlandTransferId: string | null;
  tractor: string;
  trailer: string;
  driverName: string;
  scheduledAt: ISODate;
  status: TransportJobStatus;
  startedAt?: ISODate;
  deliveredAt?: ISODate;
  proofOfDelivery?: { receivedBy: string; at: ISODate; note: string; documentId?: string };
  version: number;
  createdBy: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

/* ============================================================ Momentum warehouse inventory */

export type StockUnit = 'units' | 'pallets' | 'cartons' | 'kg' | 'tonnes';
export type StockCategory = 'FMCG' | 'Automotive' | 'Industrial' | 'Oil and gas' | 'Project cargo' | 'Retail' | 'Pharma';

export interface Sku {
  id: string;
  code: string;
  name: string;
  description: string;
  customerId: string;
  category: StockCategory;
  unit: StockUnit;
  weightKg: number;
  handling: string[];
  barcode: string;
  version: number;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type Bucket = 'available' | 'reserved' | 'damaged' | 'held';
export const BUCKETS: Bucket[] = ['available', 'reserved', 'damaged', 'held'];

export interface StockBalance {
  /** `${skuId}:${locationId}` */
  id: string;
  skuId: string;
  locationId: string;
  available: number;
  reserved: number;
  damaged: number;
  held: number;
  version: number;
  updatedAt: ISODate;
}

export type StockMovementType = 'receipt' | 'damage' | 'reserve' | 'release' | 'pick' | 'transfer' | 'adjustment' | 'hold' | 'unhold' | 'reversal';

export interface MovementEffect {
  locationId: string;
  bucket: Bucket;
  delta: number;
}

/** One immutable row in the stock ledger. Corrections are new rows that reverse earlier ones. */
export interface StockMovement {
  id: string;
  reference: string;
  skuId: string;
  type: StockMovementType;
  quantity: number;
  unit: StockUnit;
  sourceLocationId: string | null;
  destinationLocationId: string | null;
  effects: MovementEffect[];
  orderId?: string;
  operationId?: string;
  approvalId?: string;
  employeeId: string;
  timestamp: ISODate;
  reason: string;
  idempotencyKey?: string;
  reversesMovementId?: string;
  reversedByMovementId?: string;
}

export type WarehouseOrderType = 'inbound' | 'outbound';
export type WarehouseOrderStatus = 'expected' | 'received' | 'allocated' | 'picked' | 'dispatched' | 'cancelled';

export interface WarehouseOrderLine {
  skuId: string;
  quantity: number;
  receivedQty: number;
  damagedQty: number;
  pickedQty: number;
}

export interface WarehouseOrder {
  id: string;
  reference: string;
  type: WarehouseOrderType;
  customerId: string;
  locationId: string;
  customerReference: string;
  lines: WarehouseOrderLine[];
  status: WarehouseOrderStatus;
  expectedAt: ISODate;
  transportJobId: string | null;
  exceptions: string[];
  version: number;
  createdBy: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type OperationType = 'receiving' | 'picking' | 'transfer';
export type OperationStatus = 'completed' | 'completed_with_exceptions';

export interface WarehouseOperation {
  id: string;
  reference: string;
  type: OperationType;
  status: OperationStatus;
  locationId: string;
  destinationLocationId?: string;
  orderId?: string;
  lines: { skuId: string; expectedQty: number; actualQty: number; damagedQty: number }[];
  exceptions: string[];
  movementIds: string[];
  employeeId: string;
  completedAt: ISODate;
  idempotencyKey: string;
  notes: string;
  syncedFromClientId?: string;
}

export type TaskType = 'discharge' | 'load' | 'gate' | 'yard_shift' | 'reefer_check' | 'receiving' | 'picking' | 'stock_count' | 'inspection' | 'transfer';
export type TaskStatus = 'open' | 'in_progress' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'normal' | 'high';

export interface WorkTask {
  id: string;
  reference: string;
  title: string;
  type: TaskType;
  locationId: string;
  assigneeId: string | null;
  createdBy: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: ISODate;
  refKind?: 'vessel_call' | 'container' | 'order' | 'transfer' | 'transport_job';
  refId?: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

/* ============================================================ Documents */

export type DocumentType =
  | 'Delivery order' | 'Bill of lading' | 'Customs declaration' | 'Equipment interchange receipt' | 'Bay plan'
  | 'BAPLIE' | 'Dangerous goods declaration' | 'VGM certificate' | 'Proof of delivery' | 'Inspection report'
  | 'Commercial invoice' | 'Packing list' | 'Other';

export interface DocumentVersion {
  version: number;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  /** SHA-256 of the uploaded bytes, computed in the browser. */
  checksum: string;
  uploadedBy: string;
  uploadedAt: ISODate;
  note: string;
}

export interface DocumentRecord {
  id: string;
  reference: string;
  type: DocumentType;
  title: string;
  containerId?: string;
  vesselCallId?: string;
  orderId?: string;
  transportJobId?: string;
  partyId?: string;
  versions: DocumentVersion[];
  retentionYears: number;
  access: Role[];
  legallySignificant: boolean;
  createdAt: ISODate;
  updatedAt: ISODate;
}

/* ============================================================ Finance */

export type Currency = 'AED' | 'USD' | 'SAR' | 'IQD';
export type ServiceCode =
  | 'STEV_FULL' | 'STEV_EMPTY' | 'STEV_TS_FULL' | 'STEV_TS_EMPTY' | 'PRC_FULL' | 'PRC_EMPTY'
  | 'STORAGE_IMPORT' | 'STORAGE_EXPORT' | 'STORAGE_EMPTY' | 'STORAGE_TS'
  | 'SHIFT_CFS' | 'SHIFT_SCAN' | 'SHIFT_OTHER' | 'EMPTY_RELEASE' | 'RESTOW'
  | 'DG_SURCHARGE' | 'REEFER_MONITOR' | 'OVERTIME_GATE' | 'ETOKEN' | 'ETOKEN_AMEND' | 'INLAND_TRANSFER'
  | 'WH_HANDLING' | 'WH_STORAGE' | 'TRANSPORT' | 'VGM';

export interface Charge {
  id: string;
  reference: string;
  serviceCode: ServiceCode;
  description: string;
  partyId: string;
  containerId?: string;
  vesselCallId?: string;
  orderId?: string;
  transportJobId?: string;
  tokenId?: string;
  quantity: number;
  unitAmount: number;
  amount: number;
  currency: Currency;
  invoiceId: string | null;
  createdBy: string;
  createdAt: ISODate;
}

export type InvoiceStatus = 'draft' | 'issued' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';

export interface Payment {
  id: string;
  receiptNumber: string;
  amount: number;
  method: 'online_card' | 'bank_transfer' | 'credit_note';
  reference: string;
  at: ISODate;
  by: string;
}

export interface Invoice {
  id: string;
  reference: string;
  partyId: string;
  chargeIds: string[];
  subtotal: number;
  vatRate: number;
  vat: number;
  total: number;
  paid: number;
  currency: Currency;
  status: InvoiceStatus;
  issuedAt?: ISODate;
  dueAt?: ISODate;
  payments: Payment[];
  history: { at: ISODate; by: string; from: InvoiceStatus | null; to: InvoiceStatus; note?: string }[];
  version: number;
  createdAt: ISODate;
}

/** Tariff values (AED) from the KCT Schedule of Charges effective 1 June 2026. Editable in Finance. */
export interface Tariff {
  currency: Currency;
  vatRate: number;
  stevedoring: { full: [number, number]; empty: [number, number]; tsFull: [number, number]; tsEmpty: [number, number] };
  portReceiving: { full: [number, number]; empty: [number, number] };
  shifting: { cfs: [number, number]; scan: [number, number]; other: [number, number]; emptyRelease: [number, number]; outside: [number, number] };
  restow: { dry: number; dg: number; oog: number };
  /** Day slabs: [fromDay, toDay | null, rate20, rate40] */
  storageImport: { normal: [number, number | null, number, number][]; oog: [number, number | null, number, number][]; dg: [number, number | null, number, number][] };
  storageExport: { normal: [number, number | null, number, number][]; oog: [number, number | null, number, number][]; dg: [number, number | null, number, number][] };
  storageEmptyPerDay: [number, number];
  storageTranshipmentPerDay: [number, number];
  freeDays: { nonDg: number; dg: number };
  dgSurchargePct: number;
  reeferMonitoringPerDay: number;
  overtimeGate: number;
  etoken: number;
  etokenAmendment: number;
  inlandTransfer: [number, number];
  warehouseHandlingPerUnit: number;
  warehouseStoragePerPalletDay: number;
  transportPerTrip: number;
  vgm: number;
  uncollectedTransferDays: number;
}

/* ============================================================ Notifications, audit, approvals */

export type NotificationType =
  | 'vessel_berthed' | 'vessel_completed' | 'container_ready' | 'hold_placed' | 'hold_released' | 'token_generated'
  | 'gate_out' | 'uncollected' | 'inland_transfer' | 'stock_received' | 'stock_dispatched' | 'inventory_discrepancy'
  | 'cargo_damaged' | 'pending_approval' | 'approval_decided' | 'integration_failed' | 'missing_document'
  | 'payment_received' | 'invoice_overdue' | 'reefer_alert' | 'transport_delayed' | 'low_stock';

export type Severity = 'info' | 'success' | 'warning' | 'danger';

export interface Notification {
  id: string;
  type: NotificationType;
  severity: Severity;
  title: string;
  body: string;
  entity?: { kind: 'container' | 'vessel_call' | 'token' | 'order' | 'approval' | 'movement' | 'document' | 'invoice' | 'transfer' | 'transport_job'; id: string };
  audience: Role[];
  createdAt: ISODate;
  readBy: string[];
}

export interface AuditEntry {
  id: string;
  actorId: string;
  actorName: string;
  orgId: string;
  locationId: string | null;
  action: string;
  entityKind: string;
  entityId: string;
  entityRef: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  reason?: string;
  requestId: string;
  approvalId?: string;
  timestamp: ISODate;
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface Approval {
  id: string;
  reference: string;
  kind: 'stock_adjustment' | 'charge_waiver';
  status: ApprovalStatus;
  requestedBy: string;
  requestedAt: ISODate;
  decidedBy?: string;
  decidedAt?: ISODate;
  decisionNote?: string;
  payload: { skuId?: string; locationId?: string; bucket?: Bucket; delta?: number; chargeId?: string; reason: string };
  movementId?: string;
}

/* ============================================================ Reliability plumbing */

export interface OutboxEvent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: ISODate;
  status: 'pending' | 'published' | 'failed';
  attempts: number;
  publishedAt?: ISODate;
}

export type QueuedKind = 'gate_out' | 'gate_in' | 'yard_shift' | 'receiving' | 'picking' | 'stock_transfer';

export interface QueuedOperation {
  /** Client-generated before any network call; doubles as the idempotency key. */
  clientId: string;
  kind: QueuedKind;
  summary: string;
  payload: Record<string, unknown>;
  queuedAt: ISODate;
  queuedBy: string;
  status: 'queued' | 'synced' | 'rejected';
  attempts: number;
  error?: string;
  serverReference?: string;
  syncedAt?: ISODate;
}

export type IntegrationEventType = 'BAPLIE' | 'COPRAR' | 'CUSTOMS_CLEARANCE' | 'CARRIER_TRACKING' | 'SAP_POSTING';

export interface IntegrationEvent {
  id: string;
  provider: string;
  eventId: string;
  type: IntegrationEventType;
  subject: string;
  receivedAt: ISODate;
  status: 'applied' | 'duplicate' | 'failed';
  detail: string;
}

export interface IdempotencyRecord {
  key: string;
  resultKind: string;
  resultId: string;
  at: ISODate;
}

export interface OpsSettings {
  offline: boolean;
  lowStockThreshold: number;
  adjustmentApprovalThreshold: number;
  counters: Record<string, number>;
}

export interface OpsDB {
  schemaVersion: number;
  seededAt: ISODate;
  settings: OpsSettings;
  tariff: Tariff;
  organizations: Organization[];
  locations: Location[];
  employees: Employee[];
  parties: Party[];
  vesselCalls: VesselCall[];
  containers: Container[];
  containerEvents: ContainerEvent[];
  tokens: EToken[];
  gateTransactions: GateTransaction[];
  inlandTransfers: InlandTransfer[];
  transportJobs: TransportJob[];
  skus: Sku[];
  balances: StockBalance[];
  movements: StockMovement[];
  warehouseOrders: WarehouseOrder[];
  operations: WarehouseOperation[];
  tasks: WorkTask[];
  documents: DocumentRecord[];
  charges: Charge[];
  invoices: Invoice[];
  notifications: Notification[];
  audit: AuditEntry[];
  approvals: Approval[];
  outbox: OutboxEvent[];
  offlineQueue: QueuedOperation[];
  integrations: IntegrationEvent[];
  idempotency: Record<string, IdempotencyRecord>;
}

/* ============================================================ Labels */

export const ROLE_LABELS: Record<Role, string> = {
  system_admin: 'System administrator',
  terminal_ops: 'Terminal operations',
  planner: 'Ship and yard planner',
  gate_officer: 'Gate officer',
  customer_service: 'Customer service',
  warehouse_worker: 'Warehouse worker',
  warehouse_supervisor: 'Warehouse supervisor',
  inventory_manager: 'Inventory manager',
  transport_manager: 'Transport manager',
  finance_manager: 'Finance manager',
  auditor: 'Auditor',
};

export const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  terminal: 'Container terminal',
  inland_depot: 'Inland container depot',
  logistics_centre: 'Logistics centre',
  warehouse: 'Warehouse',
};

export const PARTY_TYPE_LABELS: Record<PartyType, string> = {
  shipping_line: 'Shipping line',
  consignee: 'Consignee',
  clearing_agent: 'Clearing agent',
  haulier: 'Haulier',
  contract_customer: 'Contract logistics customer',
  shipper: 'Shipper',
};

export const VESSEL_STATUS_LABELS: Record<VesselCallStatus, string> = {
  expected: 'Expected',
  berthed: 'On berth',
  working: 'Working',
  completed: 'Operations completed',
  departed: 'Departed',
};

export const CONTAINER_CATEGORY_LABELS: Record<ContainerCategory, string> = {
  import: 'Import',
  export: 'Export',
  transhipment: 'Transhipment',
  empty: 'Empty',
};

export const CONTAINER_STATUS_LABELS: Record<ContainerPhysicalStatus, string> = {
  expected: 'Expected on vessel',
  in_yard: 'In yard',
  on_truck: 'Gated out',
  on_vessel: 'Loaded on vessel',
  delivered: 'Delivered',
};

export const CUSTOMS_LABELS: Record<CustomsStatus, string> = {
  not_required: 'Not required',
  pending: 'Pending',
  inspection: 'Under inspection',
  cleared: 'Cleared',
};

export const HOLD_LABELS: Record<HoldType, string> = {
  customs: 'Customs hold',
  shipping_line: 'Shipping line hold',
  terminal: 'Terminal hold',
  dg: 'DG hold',
  documentation: 'Documentation hold',
};

export const TOKEN_TYPE_LABELS: Record<TokenType, string> = {
  import_pickup: 'Import pick-up',
  export_dropoff: 'Export drop-off',
  empty_return: 'Empty return',
  empty_release: 'Empty release',
};

export const TOKEN_STATUS_LABELS: Record<TokenStatus, string> = {
  generated: 'Generated',
  at_marshalling_yard: 'At marshalling yard',
  gated: 'Gated',
  completed: 'Completed',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

export const TRANSPORT_TYPE_LABELS: Record<TransportJobType, string> = {
  import_delivery: 'Import delivery',
  export_collection: 'Export collection',
  inland_transfer: 'Inland transfer',
  empty_repositioning: 'Empty repositioning',
  warehouse_distribution: 'Warehouse distribution',
};

export const TRANSPORT_STATUS_LABELS: Record<TransportJobStatus, string> = {
  planned: 'Planned',
  assigned: 'Assigned',
  en_route: 'En route',
  delivered: 'Delivered',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

export const ORDER_STATUS_LABELS: Record<WarehouseOrderStatus, string> = {
  expected: 'Expected',
  received: 'Received',
  allocated: 'Allocated',
  picked: 'Picked',
  dispatched: 'Dispatched',
  cancelled: 'Cancelled',
};

export const MOVEMENT_TYPE_LABELS: Record<StockMovementType, string> = {
  receipt: 'Receipt',
  damage: 'Damage',
  reserve: 'Allocation',
  release: 'Release',
  pick: 'Pick and dispatch',
  transfer: 'Transfer',
  adjustment: 'Adjustment',
  hold: 'Hold',
  unhold: 'Hold released',
  reversal: 'Reversal',
};

export const BUCKET_LABELS: Record<Bucket, string> = {
  available: 'Available',
  reserved: 'Allocated',
  damaged: 'Damaged',
  held: 'Held',
};

export const CONTAINER_EVENT_LABELS: Record<ContainerEventType, string> = {
  registered: 'Registered',
  discharged: 'Discharged from vessel',
  loaded: 'Loaded on vessel',
  shifted: 'Yard shift',
  restowed: 'Restow',
  gate_in: 'Gate in',
  gate_out: 'Gate out',
  hold_placed: 'Hold placed',
  hold_released: 'Hold released',
  customs_update: 'Customs status',
  delivery_order: 'Delivery order received',
  charges_settled: 'Charges settled',
  haulier_assigned: 'Haulier assigned',
  token_generated: 'E-token generated',
  token_cancelled: 'E-token cancelled',
  inland_transfer_out: 'Transferred to inland depot',
  inland_transfer_in: 'Received at inland depot',
  reefer_check: 'Reefer check',
  delivered: 'Delivered',
  inspection: 'Inspection',
};

export const SERVICE_LABELS: Record<ServiceCode, string> = {
  STEV_FULL: 'Stevedoring, full container',
  STEV_EMPTY: 'Stevedoring, empty container',
  STEV_TS_FULL: 'Transhipment stevedoring, full',
  STEV_TS_EMPTY: 'Transhipment stevedoring, empty',
  PRC_FULL: 'Port receiving charge, full',
  PRC_EMPTY: 'Port receiving charge, empty',
  STORAGE_IMPORT: 'Storage, import full',
  STORAGE_EXPORT: 'Storage, export full',
  STORAGE_EMPTY: 'Storage, empty',
  STORAGE_TS: 'Storage, transhipment',
  SHIFT_CFS: 'Shifting to CFS',
  SHIFT_SCAN: 'Shifting for scanning',
  SHIFT_OTHER: 'Shifting within terminal',
  EMPTY_RELEASE: 'Empty release handling',
  RESTOW: 'Restow',
  DG_SURCHARGE: 'Dangerous goods surcharge',
  REEFER_MONITOR: 'Reefer monitoring',
  OVERTIME_GATE: 'Overtime gate delivery',
  ETOKEN: 'E-token, import pick-up',
  ETOKEN_AMEND: 'E-token amendment',
  INLAND_TRANSFER: 'Inland transfer',
  WH_HANDLING: 'Warehouse handling',
  WH_STORAGE: 'Warehouse storage',
  TRANSPORT: 'Transport',
  VGM: 'Weighbridge and VGM',
};

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  issued: 'Issued',
  partially_paid: 'Partially paid',
  paid: 'Paid',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
};
