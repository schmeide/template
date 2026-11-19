import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithBackend, submitted } from "../../requests/__tests__/fakeBackend.tsx";
import { answerFor, CustomerRequests, RequestCustomer } from "../RequestCustomer.tsx";

// A membership application from the public form, with labels in any case.
const application = (status: "submitted" | "approved") =>
  submitted({
    status,
    submitterId: null,
    submitterName: null,
    contact: "Pat",
    answers: {
      NAME: "Pat Lee",
      email: "pat@example.com",
      Phone: "07700 900123",
      " Address ": "1 High St",
      Level: "Adult",
    },
  });
const customers = [
  { id: 4, name: "Pat Lee", email: "pat@club.example", phone: "", address: "", createdAt: "" },
];

describe("answerFor", () => {
  it("finds an answer by its label in any case, and is empty for none", () => {
    expect(answerFor({ EMAIL: "a@example.com" }, "email")).toBe("a@example.com");
    expect(answerFor({ Phone: 7700 }, "phone")).toBe("7700");
    expect(answerFor({ Phone: { result: "pass" } }, "phone")).toBe("");
    expect(answerFor({}, "name")).toBe("");
  });
});

describe("RequestCustomer", () => {
  beforeEach(() => {
    window.location.hash = "#/requests/30";
  });

  it("offers a new customer filled from the answers, for staff to check and save", async () => {
    const calls = renderWithBackend(<RequestCustomer id={30} />, {
      "requests.get": () => application("approved"),
      "requestCustomers.forRequest": () => null,
      "customers.list": () => customers,
      "requestCustomers.convert": () => ({ id: 12 }),
    });
    const user = userEvent.setup();

    expect(await screen.findByLabelText("Name")).toHaveValue("Pat Lee");
    expect(screen.getByLabelText("Email")).toHaveValue("pat@example.com");
    expect(screen.getByLabelText("Phone")).toHaveValue("07700 900123");
    expect(screen.getByLabelText("Address")).toHaveValue("1 High St");
    await user.clear(screen.getByLabelText("Phone"));
    await user.click(screen.getByRole("button", { name: "Save customer" }));

    await waitFor(() => expect(window.location.hash).toBe("#/customers/12"));
    expect(calls.find((call) => call.path === "requestCustomers.convert")?.input).toEqual({
      requestId: 30,
      customer: { name: "Pat Lee", email: "pat@example.com", phone: "", address: "1 High St" },
    });
  });

  it("links to an existing customer a person picks", async () => {
    const calls = renderWithBackend(<RequestCustomer id={30} />, {
      "requests.get": () => application("approved"),
      "requestCustomers.forRequest": () => null,
      "customers.list": () => customers,
      "requestCustomers.convert": () => ({ id: 4 }),
    });
    const user = userEvent.setup();

    await screen.findByRole("option", { name: "Pat Lee, pat@club.example" });
    await user.selectOptions(screen.getByLabelText("Customer"), "Pat Lee, pat@club.example");
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Link to customer" }));

    await waitFor(() =>
      expect(calls.find((call) => call.path === "requestCustomers.convert")?.input).toEqual({
        requestId: 30,
        customerId: 4,
      })
    );
  });

  it("links to the customer once added, and offers nothing more", async () => {
    renderWithBackend(<RequestCustomer id={30} />, {
      "requests.get": () => application("approved"),
      "requestCustomers.forRequest": () => ({ id: 4, name: "Pat Lee" }),
    });

    expect(await screen.findByRole("link", { name: "Pat Lee" })).toHaveAttribute(
      "href",
      "#/customers/4"
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("offers nothing on a request that is not approved", async () => {
    const calls = renderWithBackend(<RequestCustomer id={30} />, {
      "requests.get": () => application("submitted"),
      "requestCustomers.forRequest": () => null,
    });

    await waitFor(() =>
      expect(calls.map((call) => call.path)).toContain("requestCustomers.forRequest")
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("CustomerRequests", () => {
  it("lists the requests linked to a customer", async () => {
    renderWithBackend(<CustomerRequests id={4} />, {
      "requestCustomers.forCustomer": () => [
        { id: 30, typeName: "Membership application", createdAt: new Date("2030-01-01") },
      ],
    });

    expect(await screen.findByRole("link", { name: "Membership application #30" })).toHaveAttribute(
      "href",
      "#/requests/30"
    );
  });
});
