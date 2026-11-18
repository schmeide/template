import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithBackend, submitted } from "../../requests/__tests__/fakeBackend.tsx";
import { DealSource, RequestDeal } from "../RequestDeal.tsx";

// A callout from the public form: no submitter, only a free-text contact.
const callout = (status: "submitted" | "approved") =>
  submitted({ status, submitterId: null, submitterName: null, contact: "Pat, 07700 900123" });
const link = { request: { id: 30, typeName: "Leave" }, deal: { id: 9, title: "Leave" } };
const customers = [{ id: 4, name: "Acme Ltd", email: "", phone: "", address: "", createdAt: "" }];

describe("RequestDeal", () => {
  beforeEach(() => {
    window.location.hash = "#/requests/30";
  });

  it("makes an approved request into a deal for a customer picked, and opens it", async () => {
    const calls = renderWithBackend(<RequestDeal id={30} />, {
      "requests.get": () => callout("approved"),
      "requestDeals.forRequest": () => null,
      "customers.list": () => customers,
      "requestDeals.convert": () => ({ id: 9 }),
    });
    const user = userEvent.setup();

    await screen.findByRole("option", { name: "Acme Ltd" });
    await user.selectOptions(screen.getByLabelText("Customer"), "Acme Ltd");
    await user.click(screen.getByRole("button", { name: "Make deal" }));

    await waitFor(() => expect(window.location.hash).toBe("#/deals/9"));
    expect(calls.find((call) => call.path === "requestDeals.convert")?.input).toEqual({
      requestId: 30,
      customerId: 4,
    });
  });

  it("creates a new customer, starting from the request's contact", async () => {
    const calls = renderWithBackend(<RequestDeal id={30} />, {
      "requests.get": () => callout("approved"),
      "requestDeals.forRequest": () => null,
      "customers.list": () => customers,
      "requestDeals.convert": () => ({ id: 9 }),
    });
    const user = userEvent.setup();

    await user.selectOptions(await screen.findByLabelText("Customer"), "New customer");
    const name = screen.getByLabelText("Name");
    expect(name).toHaveValue("Pat, 07700 900123");
    await user.clear(name);
    await user.type(name, "Pat Jones");
    await user.click(screen.getByRole("button", { name: "Make deal" }));

    await waitFor(() =>
      expect(calls.find((call) => call.path === "requestDeals.convert")?.input).toEqual({
        requestId: 30,
        customer: { name: "Pat Jones" },
      })
    );
  });

  it("offers nothing before the request is approved", async () => {
    const calls = renderWithBackend(<RequestDeal id={30} />, {
      "requests.get": () => callout("submitted"),
      "requestDeals.forRequest": () => null,
    });

    await waitFor(() =>
      expect(calls.map((call) => call.path)).toContain("requestDeals.forRequest")
    );
    expect(screen.queryByRole("button", { name: "Make deal" })).not.toBeInTheDocument();
  });

  it("links to the deal once it exists", async () => {
    renderWithBackend(<RequestDeal id={30} />, {
      "requests.get": () => callout("approved"),
      "requestDeals.forRequest": () => link,
    });

    expect(await screen.findByRole("link", { name: "Leave" })).toHaveAttribute("href", "#/deals/9");
    expect(screen.queryByRole("button", { name: "Make deal" })).not.toBeInTheDocument();
  });
});

describe("DealSource", () => {
  it("links a deal to the request it was made from", async () => {
    renderWithBackend(<DealSource id={9} />, { "requestDeals.forDeal": () => link });

    expect(await screen.findByRole("link", { name: "Leave #30" })).toHaveAttribute(
      "href",
      "#/requests/30"
    );
  });
});
