import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "../trpc.ts";

// Shown on a quote, in the invoices shape's "quote" slot: "Make invoice" once the quote is
// accepted, then a link to the invoice made from it.
export function QuoteConversion({ id }: { readonly id: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // The same query as the page around it, so this follows its status changes.
  const quote = useQuery(trpc.quotes.get.queryOptions({ id }));
  const link = useQuery(trpc.conversions.get.queryOptions({ id }));
  const convert = useMutation(
    trpc.conversions.convert.mutationOptions({
      onSuccess: async (invoice) => {
        await queryClient.invalidateQueries({ queryKey: trpc.conversions.pathKey() });
        await queryClient.invalidateQueries({ queryKey: trpc.invoices.pathKey() });
        window.location.assign(`#/invoices/${invoice.id}`);
      },
      // Someone else may have made the invoice first; show theirs.
      onError: () => queryClient.invalidateQueries({ queryKey: trpc.conversions.pathKey() }),
    })
  );

  if (link.data) {
    return (
      <p className="invoice-no-print">
        Invoiced as <a href={`#/invoices/${link.data.invoice.id}`}>{link.data.invoice.reference}</a>
      </p>
    );
  }
  if (link.data === null && quote.data?.status === "accepted") {
    return (
      <div className="invoice-actions invoice-no-print">
        <button
          type="button"
          disabled={convert.isPending}
          onClick={() => convert.mutate({ quoteId: id })}
        >
          Make invoice
        </button>
        {convert.error && <p role="alert">Unable to make the invoice: {convert.error.message}</p>}
      </div>
    );
  }
  return null;
}

// Shown on an invoice, in the invoices shape's "invoice" slot: the quote it was made from.
export function InvoiceSource({ id }: { readonly id: number }) {
  const trpc = useTRPC();
  const link = useQuery(trpc.conversions.get.queryOptions({ id }));

  if (!link.data) return null;
  return (
    <p className="invoice-no-print">
      Made from quote <a href={`#/quotes/${link.data.quote.id}`}>{link.data.quote.reference}</a>
    </p>
  );
}
