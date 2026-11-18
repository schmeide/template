import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "../trpc.ts";

// Dates travel as "YYYY-MM-DD" calendar days, so format them in UTC to keep the same day.
const formatDate = (day: string): string =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`)
  );

// Shown on each period of a member, in the membership shape's "period" slot: unbilled with
// "Bill dues", or billed or paid with a link to the invoice.
export function PeriodDues({ id }: { readonly id: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const dues = useQuery(trpc.dues.forPeriod.queryOptions({ id }));
  const bill = useMutation(
    trpc.dues.bill.mutationOptions({
      onSuccess: async (invoice) => {
        await queryClient.invalidateQueries({ queryKey: trpc.dues.pathKey() });
        await queryClient.invalidateQueries({ queryKey: trpc.invoices.pathKey() });
        window.location.assign(`#/invoices/${invoice.id}`);
      },
      // Someone else may have billed it first; show theirs.
      onError: () => queryClient.invalidateQueries({ queryKey: trpc.dues.pathKey() }),
    })
  );

  const data = dues.data;
  if (!data) return null;
  if (data.invoice) {
    return (
      <p>
        {data.state === "paid" ? "Dues paid" : "Dues billed"} on{" "}
        <a href={`#/invoices/${data.invoice.id}`}>{data.invoice.reference}</a>
      </p>
    );
  }
  if (!data.billable) return <p>No dues to bill</p>;
  return (
    <p>
      Dues unbilled{" "}
      <button type="button" disabled={bill.isPending} onClick={() => bill.mutate({ periodId: id })}>
        Bill dues
      </button>
      {bill.error && <span role="alert"> Unable to bill the dues: {bill.error.message}</span>}
    </p>
  );
}

// Shown on an invoice, in the invoices shape's "invoice" slot: the membership period it bills.
export function InvoicePeriod({ id }: { readonly id: number }) {
  const trpc = useTRPC();
  const period = useQuery(trpc.dues.forInvoice.queryOptions({ id }));

  if (!period.data) return null;
  const { customerId, levelName, startsOn, endsOn } = period.data;
  return (
    <p className="invoice-no-print">
      Dues for{" "}
      <a href={`#/members/${customerId}`}>
        {levelName} membership, {formatDate(startsOn)}
        {endsOn === null ? " for life" : ` to ${formatDate(endsOn)}`}
      </a>
    </p>
  );
}
