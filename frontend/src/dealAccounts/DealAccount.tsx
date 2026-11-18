import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "../trpc.ts";

// Shown on a deal, in the deals shape's "deal" slot: "Open project" once the deal is won, then a
// link to the ledger account opened for it.
export function DealAccount({ id }: { readonly id: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // The same query as the page around it, so this follows its stage changes.
  const deal = useQuery(trpc.deals.get.queryOptions({ id }));
  const link = useQuery(trpc.dealAccounts.byDeal.queryOptions({ id }));
  const open = useMutation(
    trpc.dealAccounts.open.mutationOptions({
      onSuccess: async (account) => {
        await queryClient.invalidateQueries({ queryKey: trpc.dealAccounts.pathKey() });
        await queryClient.invalidateQueries({ queryKey: trpc.stock.pathKey() });
        window.location.assign(`#/stock/${account.id}`);
      },
      // Someone else may have opened it first; show theirs.
      onError: () => queryClient.invalidateQueries({ queryKey: trpc.dealAccounts.pathKey() }),
    })
  );

  if (link.data) {
    return (
      <p>
        Opened as project <a href={`#/stock/${link.data.account.id}`}>{link.data.account.name}</a>
      </p>
    );
  }
  if (link.data === null && deal.data?.stage.outcome === "won") {
    return (
      <div className="deal-actions">
        <button type="button" disabled={open.isPending} onClick={() => open.mutate({ itemId: id })}>
          Open project
        </button>
        {open.error && <p role="alert">Unable to open the project: {open.error.message}</p>}
      </div>
    );
  }
  return null;
}

// Shown on a ledger account, in the stock shape's "account" slot: the deal it was opened for.
export function AccountDeal({ id }: { readonly id: number }) {
  const trpc = useTRPC();
  const link = useQuery(trpc.dealAccounts.byAccount.queryOptions({ id }));

  if (!link.data) return null;
  return (
    <p>
      Opened for deal <a href={`#/deals/${link.data.deal.id}`}>{link.data.deal.title}</a>
    </p>
  );
}
