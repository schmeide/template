import { useHashPath } from "../App.tsx";
import { InvoiceEditor } from "./InvoiceEditor.tsx";
import { InvoiceList } from "./InvoiceList.tsx";
import { InvoiceView, SharedInvoice } from "./InvoiceView.tsx";
import "./invoices.css";

// #/invoices, #/invoices/new, #/invoices/<id>, #/invoices/<id>/edit, #/invoices/share/<token>.
// ponytail: the share view still shows the app menu; with no sign-in every visitor is staff anyway.
// Once sign-in exists, serve the share view outside it and without the menu.
export function Invoices() {
  const [, first, second] = useHashPath();
  const id = Number(first);

  if (first === "new") return <InvoiceEditor key="new" />;
  if (first === "share" && second) return <SharedInvoice token={second} />;
  if (first && Number.isInteger(id)) {
    return second === "edit" ? (
      <InvoiceEditor key={`edit-${id}`} id={id} />
    ) : (
      <InvoiceView key={id} id={id} />
    );
  }
  return <InvoiceList />;
}
