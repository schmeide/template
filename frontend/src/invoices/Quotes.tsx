import { kinds } from "./format.ts";
import { DocumentPage } from "./Invoices.tsx";

export function Quotes() {
  return <DocumentPage kind={kinds.quote} />;
}
