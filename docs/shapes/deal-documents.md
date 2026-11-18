# Deal to quotes and invoices

A link shape: a deal's quotes and invoices, made from the deal and listed on it. It requires [deals](deals.md) and
[invoices](invoices.md) and has no page of its own. Its view appears on the deal page through the `deal` slot that the
deals shape exposes.

## What it has

- **The link** (`deal_documents` table): one row per document, with `document_id` as its primary key and `item_id`
  referencing the deal in `pipeline_items`.
- **New quote and New invoice**: on a deal with a contact. Each makes an empty draft for the contact, issued today and
  due (or valid until) in 30 days, through the invoices shape's `insertDocument`, links it to the deal and opens it
  in the editor.
- **The list**: the deal shows its documents, newest first, with number, status and total. Each number links to its
  document.

## Rules

- A document belongs to at most one deal; the primary key on `document_id` enforces it. A deal has any number.
- A deal with no contact gets no document, since a document needs a customer. The deal page asks for a contact
  instead of offering the buttons, and the server refuses with "Set the deal's contact first".
- Making a document holds a share lock on the deal row, so a contact cleared at the same moment waits: the document
  is for the contact the deal had when it was made. Two people making documents on one deal at once get two, each
  with its own number.
- The link never changes a deal's stage or a document's status. Moving a deal on when its invoice is sent or paid is
  a person's choice.

## What usually varies

- The term: `termDays` in `backend/src/services/dealDocuments.ts`.
- What a new document starts with (lines from the deal's value, say): the fields passed to `insertDocument` in
  `createDealDocument`.
- The wording, when deals or documents are renamed (jobs, proposals). The buttons take the document names from
  `kinds` in the invoices shape. The heading and messages in `frontend/src/dealDocuments/DealDocuments.tsx`, and the
  refusal in `backend/src/routers/dealDocuments.ts`, name them directly.

## Limits

- Only new documents link. An existing quote or invoice cannot be attached to a deal, and a link cannot be removed.
- The invoice and quote pages do not show their deal.
- "Today", for the issue date, is the server's UTC date, as in the invoices shape.
