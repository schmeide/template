import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.ts";
import { appRouter } from "../../router.ts";

const db = createDb(process.env.DATABASE_URL ?? "");
const staff = appRouter.createCaller({ db });
afterAll(() => db.$client.end());

const fails = (code: TRPCError["code"]) => ({ code }) satisfies Partial<TRPCError>;

const visitor = () => appRouter.createCaller({ db, ip: randomUUID() });
const details = { name: "Ada", email: "ada@example.com", address: "12 Analytical Row" } as const;

describe("orders router", () => {
  it("sells an active product, prices it on the server and lets staff move the order on", async () => {
    const product = await staff.orders.createProduct({
      name: `  Tea ${randomUUID()}  `,
      price: 450,
      category: randomUUID(),
    });
    const shopper = visitor();

    const listed = await shopper.orders.shop({ category: product.category });
    const placed = await shopper.orders.checkout({
      ...details,
      lines: [{ productId: product.id, quantity: 2 }],
    });
    const seen = await shopper.orders.publicOrder(placed);

    expect(product.name).toBe(product.name.trim());
    expect(listed).toMatchObject({ currency: "USD", products: [{ id: product.id }] });
    expect(Object.keys(placed)).toEqual(["token"]);
    expect(seen).toMatchObject({ status: "new", total: 900 });
    const [order] = (await staff.orders.list({ status: "new" })).filter(
      (row) => row.token === placed.token
    );
    expect(await staff.orders.setStatus({ id: order.id, to: "accepted" })).toMatchObject({
      status: "accepted",
    });
    await expect(staff.orders.setStatus({ id: order.id, to: "new" })).rejects.toMatchObject(
      fails("CONFLICT")
    );
  });

  it("refuses an unavailable product with a message that says what to do", async () => {
    const product = await staff.orders.createProduct({ name: randomUUID(), price: 100 });
    await staff.orders.updateProduct({ ...product, active: false });

    await expect(
      visitor().orders.checkout({ ...details, lines: [{ productId: product.id, quantity: 1 }] })
    ).rejects.toMatchObject({ code: "CONFLICT", message: expect.stringMatching(/Remove it/) });
    await expect(visitor().orders.product({ id: product.id })).rejects.toMatchObject(
      fails("NOT_FOUND")
    );
  });

  it.each([
    ["an empty cart", []],
    ["a quantity of zero", [{ productId: 1, quantity: 0 }]],
    ["a fractional quantity", [{ productId: 1, quantity: 1.5 }]],
    ["a quantity over the cap", [{ productId: 1, quantity: 1000 }]],
  ])("refuses %s", async (_label, lines) => {
    await expect(visitor().orders.checkout({ ...details, lines })).rejects.toMatchObject(
      fails("BAD_REQUEST")
    );
  });

  it.each([["javascript:alert(1)"], ["data:image/png;base64,AAAA"], ["//example.com/a.png"]])(
    "refuses the image link %s",
    async (imageUrl) => {
      await expect(
        staff.orders.createProduct({ name: "x", price: 1, imageUrl })
      ).rejects.toMatchObject(fails("BAD_REQUEST"));
    }
  );

  it.each([
    ["product", () => staff.orders.product({ id: -1 })],
    ["get", () => staff.orders.get({ id: -1 })],
    ["setStatus", () => staff.orders.setStatus({ id: -1, to: "accepted" })],
    ["updateProduct", () => staff.orders.updateProduct({ id: -1, name: "x", price: 1 })],
    ["publicOrder", () => visitor().orders.publicOrder({ token: randomUUID() })],
  ])("answers NOT_FOUND from %s for a missing row", async (_label, call) => {
    await expect(call()).rejects.toMatchObject(fails("NOT_FOUND"));
  });

  it("slows down one address after five orders", async () => {
    const product = await staff.orders.createProduct({ name: randomUUID(), price: 100 });
    const shopper = visitor();
    const send = () =>
      shopper.orders.checkout({ ...details, lines: [{ productId: product.id, quantity: 1 }] });

    for (let sent = 0; sent < 5; sent += 1) await send();

    await expect(send()).rejects.toMatchObject(fails("TOO_MANY_REQUESTS"));
  });
});
