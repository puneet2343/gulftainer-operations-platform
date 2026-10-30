'use client';

/*
 * Upload a document into the register. The file's SHA-256 is computed in the
 * browser and stored with the version; in production the bytes go to encrypted
 * object storage and only the metadata is kept here.
 */

import { useState } from 'react';
import FormDialog from '@/components/ui/FormDialog';
import { Field } from '@/components/ui/Controls';
import { INPUT, SELECT, TEXTAREA } from '@/components/ui/Table';
import { useOps, useAction } from '@/lib/ops/use-ops';
import { ops } from '@/lib/ops/ops';
import { fileChecksum } from '@/lib/format';
import { ROLE_LABELS, type DocumentRecord, type DocumentType, type Role } from '@/lib/ops/types';

const TYPES: DocumentType[] = ['Delivery order', 'Bill of lading', 'Customs declaration', 'Equipment interchange receipt', 'Bay plan', 'BAPLIE', 'Dangerous goods declaration', 'VGM certificate', 'Proof of delivery', 'Inspection report', 'Commercial invoice', 'Packing list', 'Other'];
const LEGAL: DocumentType[] = ['Delivery order', 'Bill of lading', 'Customs declaration', 'Equipment interchange receipt', 'Dangerous goods declaration', 'Proof of delivery', 'Commercial invoice'];

export default function DocumentUploadDialog({ onClose, onDone, links, defaultType = 'Other', existing }: {
  onClose: () => void;
  onDone: (document: DocumentRecord) => void;
  links?: { containerId?: string; vesselCallId?: string; orderId?: string; transportJobId?: string; partyId?: string };
  defaultType?: DocumentType;
  /** When set, the upload becomes a new version of this document. */
  existing?: DocumentRecord;
}) {
  const { actor } = useOps();
  const { run, busy, error } = useAction();
  const [type, setType] = useState<DocumentType>(existing?.type ?? defaultType);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [retention, setRetention] = useState(existing?.retentionYears ?? 7);
  const [access, setAccess] = useState<Role[]>(existing?.access ?? []);
  const legally = LEGAL.includes(type);

  async function submit() {
    if (!actor) return;
    if (!file) throw new Error('Choose a file to upload.');
    const checksum = await fileChecksum(file);
    const payload = { fileName: file.name, sizeBytes: file.size, mimeType: file.type || 'application/octet-stream', checksum };
    if (existing) return ops.addDocumentVersion(actor, { documentId: existing.id, file: payload, note });
    return ops.addDocument(actor, { type, title: title || file.name, ...links, file: payload, note, legallySignificant: legally, retentionYears: retention, access });
  }

  return (
    <FormDialog open title={existing ? `New version of ${existing.reference}` : 'Upload document'} description={existing ? 'Earlier versions stay on record; the new file becomes the current version.' : 'The file is hashed in the browser and linked to the record you opened it from.'} submitLabel={existing ? 'Upload version' : 'Upload'} busy={busy} error={error} onClose={onClose}
      onSubmit={() => void run(submit, document => { if (document) onDone(document); })}
      footer={file ? `${file.name} · ${(file.size / 1024).toFixed(0)} KB` : 'PDF, images or EDI files'}>
      {!existing && (
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="Document type" id="doc-type"><select id="doc-type" className={SELECT} value={type} onChange={event => setType(event.target.value as DocumentType)}>{TYPES.map(entry => <option key={entry}>{entry}</option>)}</select></Field>
          <Field label="Retention (years)" id="doc-retention"><input id="doc-retention" type="number" min={1} max={30} className={INPUT} value={retention} onChange={event => setRetention(Number(event.target.value))} /></Field>
          <div className="sm:col-span-2"><Field label="Title" id="doc-title"><input id="doc-title" className={INPUT} value={title} onChange={event => setTitle(event.target.value)} placeholder="Delivery order DO-55210" /></Field></div>
        </div>
      )}
      <Field label="File" id="doc-file"><input id="doc-file" type="file" className="block w-full text-[13px] text-gray-600 file:mr-3 file:h-10 file:cursor-pointer file:rounded-lg file:border file:border-gray-200 file:bg-white file:px-3 file:text-[13px] file:font-semibold file:text-secondary hover:file:border-primary/30" onChange={event => setFile(event.target.files?.[0] ?? null)} /></Field>
      <Field label="Note" id="doc-note"><textarea id="doc-note" className={TEXTAREA} value={note} onChange={event => setNote(event.target.value)} placeholder="Issued by MSC Sharjah agency" /></Field>
      {!existing && (
        <fieldset className="form-group">
          <legend className="form-label">Access</legend>
          <p className="mb-2 !text-[12px] !text-gray-400">Leave empty for every role. Auditors and system administrators can always open documents.</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(ROLE_LABELS) as Role[]).filter(role => !['system_admin', 'auditor'].includes(role)).map(role => {
              const selected = access.includes(role);
              return <button key={role} type="button" aria-pressed={selected} onClick={() => setAccess(current => selected ? current.filter(entry => entry !== role) : [...current, role])} className={`min-h-[34px] rounded-lg border px-3 text-[12px] font-semibold transition-all ${selected ? 'border-primary/25 bg-primary/[0.07] text-primary' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-secondary'}`}>{ROLE_LABELS[role]}</button>;
            })}
          </div>
        </fieldset>
      )}
      {legally && !existing && <p className="!text-[12px] !text-gray-500">This document type is legally significant: versions are append-only and never overwritten.</p>}
    </FormDialog>
  );
}
