import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AppRouter } from "../../../../backend/src/router.ts";
import { TRPCProvider } from "../../trpc.ts";
import { Customers } from "../Customers.tsx";

type Customer = {
  readonly id: number;
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly address: string;
  readonly createdAt: Date;
};

// A terminating link that keeps customers in memory instead of the network.
const fakeBackend = (customers: Customer[]): TRPCLink<AppRouter> => {
  return () =>
    ({ op }) =>
      observable((observer) => {
        const input = op.input as Pick<Customer, "id" | "name"> & Partial<Customer>;
        if (op.path === "customers.create") {
          customers.push({
            email: "",
            phone: "",
            address: "",
            ...input,
            id: 2,
            createdAt: new Date(),
          });
          observer.next({ result: { data: customers.at(-1) } });
        } else if (op.path === "customers.update") {
          customers[0] = { ...customers[0], ...input };
          observer.next({ result: { data: customers[0] } });
        } else if (op.path === "customers.get") {
          observer.next({
            result: { data: customers.find((customer) => customer.id === input.id) },
          });
        } else {
          observer.next({ result: { data: [...customers] } });
        }
        observer.complete();
      });
};

const renderCustomers = (customers: Customer[]) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const trpcClient = createTRPCClient<AppRouter>({ links: [fakeBackend(customers)] });
  render(
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <Customers />
      </TRPCProvider>
    </QueryClientProvider>
  );
};

const acme = {
  id: 1,
  name: "Acme Ltd",
  email: "billing@acme.example",
  phone: "",
  address: "",
  createdAt: new Date(),
};

describe("Customers", () => {
  it("lists customers and adds one", async () => {
    window.location.hash = "#/customers";
    renderCustomers([acme]);
    const user = userEvent.setup();

    expect(await screen.findByRole("link", { name: "Acme Ltd" })).toHaveAttribute(
      "href",
      "#/customers/1"
    );

    await user.type(screen.getByLabelText("Name"), "Globex");
    await user.click(screen.getByRole("button", { name: "Add customer" }));

    expect(await screen.findByRole("link", { name: "Globex" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("");
  });

  it("shows a customer's details and saves changes", async () => {
    window.location.hash = "#/customers/1";
    const customers = [acme];
    renderCustomers(customers);
    const user = userEvent.setup();

    expect(await screen.findByRole("heading", { name: "Acme Ltd" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveValue("billing@acme.example");

    await user.type(screen.getByLabelText("Phone"), "555 0100");
    await user.click(screen.getByRole("button", { name: "Save customer" }));

    await waitFor(() => expect(customers[0].phone).toBe("555 0100"));
    expect(await screen.findByRole("status")).toHaveTextContent("Saved");
  });
});
