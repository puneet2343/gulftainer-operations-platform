# Gulftainer Operations platform — prototype

A working prototype of a cargo operations platform for Gulftainer, built by SSI Maya. It covers GT Ports (container terminals), GT Logistics (inland depots, Momentum warehousing and transport) and the customer e-services portal, on the SSI Events design language.

Live prototype: https://gulftainer-operations-platform.vercel.app/ (login `operations` / `gulftainer2026`).

It runs entirely in the browser: the operations database is persisted to `localStorage` and seeded with a realistic data set on first use. No backend is required.

```bash
npm install
npm run dev      # http://localhost:3000
npm run lint
npm run build
```

## Signing in

Open `/admin/login`. The prototype has one account, prefilled on the login screen:

| Login ID | Password |
| --- | --- |
| `operations` | `gulftainer2026` |

The account is a system administrator with every module. The other employees in the data (terminal operations, planners, gate officers, customer service, warehouse staff, finance, auditor) appear on tasks, events, approvals and the audit log. The landing page `/` opens the operations platform login. The customer e-services portal is at `/e-services`; the e-token portal lets you act as any registered consignee or haulier.

## Modules

| Route | Module |
| --- | --- |
| `/admin/dashboard` | Operations overview: attention list, vessel programme, yard utilisation, logistics position |
| `/admin/vessels`, `/admin/vessels/[id]` | Vessel calls: pre-arrival documents, berth → operations → completion → departure, discharge and load worklists |
| `/admin/containers`, `/admin/containers/[id]`, `/admin/containers/new` | Container register and record: clearance checklist, holds, customs, delivery order, online charge collection, haulier and e-token, yard shifts, VGM, reefer checks, history, charges, documents |
| `/admin/gate` | Marshalling yard arrivals, gate-in and gate-out with equipment interchange, EIR register, offline mode |
| `/admin/transfers` | Uncollected import containers and inland transfers to SICD and Sajaa |
| `/admin/transport` | Momentum transport jobs with vehicle assignment and proof of delivery |
| `/admin/warehouse` | Contract-logistics inbound and outbound orders: receive, allocate, pick |
| `/admin/inventory` | Stock balances, immutable movement ledger with reversals, adjustments with second-person approval, SKUs |
| `/admin/tasks` | Shift tasks across terminals and warehouses |
| `/admin/customers` | Shipping lines, consignees, clearing agents, hauliers, contract customers; portal registration |
| `/admin/documents` | Versioned document register with SHA-256 checksums, retention and role access |
| `/admin/finance`, `/admin/finance/[id]` | Charges, invoices, payments, the KCT tariff |
| `/admin/notifications` | Role-addressed alerts |
| `/admin/reports` | Terminal, gate, finance, inventory and logistics reports with CSV export |
| `/admin/audit` | Append-only audit log and container trace |
| `/admin/sync` | Offline queue replay, event outbox, inbound integration messages with a simulator |
| `/admin/network`, `/admin/auth` | Entities, locations, settings, users and the permission matrix |
| `/e-services`, `/vessel-schedule`, `/container-enquiry`, `/e-token` | Customer e-services |

## Where things live

```
lib/ops/
  types.ts        domain model (vessel calls, containers, e-tokens, gate, transfers, transport, SKUs, ledger, finance, audit)
  store.ts        localStorage persistence, atomic commits, cross-tab sync, useOpsDB()
  core.ts         transaction context, errors, guards, audit, notifications, outbox, idempotency, charges
  services/       terminal.ts, logistics.ts, warehouse.ts, finance.ts, shared.ts: the business rules
  ops.ts          the façade pages call (every service wrapped in a commit)
  tariff.ts       KCT schedule of charges and the storage calculator
  iso6346.ts      container number validation
  seed.ts         demonstration data, built by replaying the services with a moving clock
  use-ops.ts      useOps() and useAction() for pages
components/ui/    design-system primitives (see DESIGN.md)
components/admin/ sidebar, shared badges and links, container dialogs, document upload, background workers
app/admin/        modules; app/(site)/ customer portal
```

## Rules enforced by the services

- Every write runs in one commit on a cloned document; a validation failure writes nothing.
- Gate, discharge, load, receiving, picking and transfers carry an idempotency key, so a retried request returns the first result instead of acting twice.
- Stock balances are derived only from ledger effects; corrections are compensating reversals, never edits.
- Adjustments at or above the threshold need a second person, and nobody approves their own request.
- Containers are released only when customs is cleared, no hold is active, the delivery order is valid and charges are settled. E-tokens cannot be deleted once the truck has entered the marshalling yard.
- Export containers are received only inside the vessel's gate window and need a VGM and customs clearance before loading.
- Offline operations replay through the same rules on sync; rejected ones wait for reconciliation.
- Inbound integration messages are de-duplicated by provider and event id; failures are recorded without touching committed data.

## Documentation

- `docs/Gulftainer-Operations-Platform-User-Guide.pdf` — how to use every screen, with images.
- `docs/Gulftainer-Operations-Platform-Project-Documentation.pdf` — research, requirements, prototype design and the proposed production architecture on AWS.
- `docs/diagrams/` — source pages for the architecture diagrams used in the documentation.

Built by Puneet Shukla, SSI Maya. Source: https://github.com/puneet2343/gulftainer-operations-platform
