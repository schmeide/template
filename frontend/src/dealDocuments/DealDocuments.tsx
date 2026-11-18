import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatMoney } from "../money/money.ts";
import { kinds, statusLabels } from "../invoices/format.ts";
import { useTRPC } from "../trpc.ts";

// Shown on a deal, in the deals shape's "deal" slot: its quotes and invoices, and buttons that
// make a new one for the deal's contact.
export function DealDocuments({ id }: { readonly id: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // The same query as the page around it, so this follows changes to the contact.
  const deal = useQuery(trpc.deals.get.queryOptions({ id }));
  const documents = useQuery(trpc.dealDocuments.list.queryOptions({ id }));
  const create = useMutation(
    trpc.dealDocuments.create.mutationOptions({
      onSuccess: async (document) => {
        await queryClient.invalidateQueries({ queryKey: trpc.dealDocuments.pathKey() });
        await queryClient.invalidateQueries({
          queryKey: trpc[kinds[document.type].path].pathKey(),
        });
        window.location.assign(`#/${kinds[document.type].path}/${document.id}/edit`);
      },
      // The contact may have been cleared meanwhile; show the deal as it is now.
      onError: () => queryClient.invalidateQueries({ queryKey: trpc.deals.pathKey() }),
    })
  );

  return (
    <section aria-labelledby="deal-documents">
      <h2 id="deal-documents">Quotes and invoices</h2>
      {documents.error && (
        <p role="alert">Unable to load quotes and invoices: {documents.error.message}</p>
      )}
      {documents.data?.length === 0 && <p>No quotes or invoices for this deal yet.</p>}
      {documents.data && documents.data.length > 0 && (
        <div className="invoice-scroll">
          <table className="invoice-table">
            <thead>
              <tr>
                <th scope="col">Number</th>
                <th scope="col">Status</th>
                <th scope="col" className="amount">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {documents.data.map((document) => (
                <tr key={document.id}>
                  <td>
                    <a href={`#/${kinds[document.type].path}/${document.id}`}>
                      {document.reference}
                    </a>
                  </td>
                  <td>{statusLabels[document.status]}</td>
                  <td className="amount">{formatMoney(document.total, document.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {deal.data?.customerId === null ? (
        <p>Set a contact in Details to make a quote or invoice for this deal.</p>
      ) : (
        <div className="deal-actions">
          {(["quote", "invoice"] as const).map((type) => (
            <button
              key={type}
              type="button"
              disabled={create.isPending}
              onClick={() => create.mutate({ itemId: id, type })}
            >
              New {kinds[type].name}
            </button>
          ))}
        </div>
      )}
      {create.error && create.variables && (
        <p role="alert">
          Unable to make the {kinds[create.variables.type].name}: {create.error.message}
        </p>
      )}
    </section>
  );
}
