import { useHashPath } from "../App.tsx";
import { kinds, type Kind } from "./format.ts";
import { InvoiceEditor } from "./InvoiceEditor.tsx";
import { InvoiceList } from "./InvoiceList.tsx";
import { InvoiceView, SharedInvoice } from "./InvoiceView.tsx";
import "./invoices.css";

// #/invoices, #/invoices/new, #/invoices/<id>, #/invoices/<id>/edit, #/invoices/share/<token>,
// and the same under #/quotes.
// ponytail: the share view still shows the app menu; with no sign-in every visitor is staff anyway.
// Once sign-in exists, serve the share view outside it and without the menu.
export function DocumentPage({ kind }: { readonly kind: Kind }) {
  const [, first, second] = useHashPath();
  const id = Number(first);

  if (first === "new") return <InvoiceEditor key="new" kind={kind} />;
  if (first === "share" && second) return <SharedInvoice token={second} kind={kind} />;
  if (first && Number.isInteger(id)) {
    return second === "edit" ? (
      <InvoiceEditor key={`edit-${id}`} id={id} kind={kind} />
    ) : (
      <InvoiceView key={id} id={id} kind={kind} />
    );
  }
  return <InvoiceList kind={kind} />;
}

export function Invoices() {
  return <DocumentPage kind={kinds.invoice} />;
}
