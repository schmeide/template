import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { currencyDigits, formatScaled, parseScaled } from "../money/money.ts";
import { useTRPC } from "../trpc.ts";
import type { Product } from "./format.ts";

type Props = {
  readonly product?: Product;
  readonly currency: string;
  readonly categories: readonly string[];
  readonly onSaved?: () => void;
};

// Adds a product, or edits `product`. Price and tax rate are typed as decimals and sent as
// integers: minor units and basis points.
export function ProductForm({ product, currency, categories, onSaved }: Props) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [invalid, setInvalid] = useState("");
  const options = {
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trpc.orders.pathKey() });
      onSaved?.();
    },
  };
  const create = useMutation(trpc.orders.createProduct.mutationOptions(options));
  const update = useMutation(trpc.orders.updateProduct.mutationOptions(options));
  const save = product ? update : create;
  const digits = currencyDigits(currency);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const text = (name: string) => String(data.get(name) ?? "");
    const price = parseScaled(text("price"), digits);
    const taxRate = text("taxRate").trim() === "" ? 0 : parseScaled(text("taxRate"), 2);
    if (price === undefined || price < 0) {
      setInvalid(
        `Enter the price as a number with at most ${digits} decimals, like ${(4.5).toFixed(digits)}.`
      );
      return;
    }
    if (taxRate === undefined || taxRate < 0 || taxRate > 10_000) {
      setInvalid("Enter the tax rate as a percentage from 0 to 100, like 20.");
      return;
    }
    setInvalid("");
    const fields = {
      name: text("name"),
      description: text("description"),
      price,
      taxRate,
      category: text("category"),
      imageUrl: text("imageUrl"),
      active: data.get("active") !== null,
    };
    if (product) update.mutate({ ...fields, id: product.id });
    else create.mutate(fields, { onSuccess: () => form.reset() });
  };

  return (
    <form onSubmit={onSubmit} className="order-form">
      <label>
        Name{" "}
        <input
          name="name"
          required
          maxLength={200}
          autoComplete="off"
          defaultValue={product?.name}
        />
      </label>
      <label>
        Description{" "}
        <textarea
          name="description"
          maxLength={2000}
          rows={3}
          defaultValue={product?.description}
        />
      </label>
      <div className="order-fields">
        <label>
          Price{" "}
          <input
            name="price"
            required
            inputMode="decimal"
            autoComplete="off"
            size={10}
            defaultValue={product && formatScaled(product.price, digits)}
          />
        </label>
        <label>
          Tax rate (%){" "}
          <input
            name="taxRate"
            inputMode="decimal"
            autoComplete="off"
            size={6}
            placeholder="0"
            defaultValue={product?.taxRate ? formatScaled(product.taxRate, 2) : undefined}
          />
        </label>
      </div>
      <label>
        Category{" "}
        <input
          name="category"
          maxLength={100}
          autoComplete="off"
          list="order-categories"
          defaultValue={product?.category}
        />
      </label>
      <datalist id="order-categories">
        {categories.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>
      <label>
        Image link (optional){" "}
        <input
          name="imageUrl"
          type="url"
          maxLength={2000}
          autoComplete="off"
          placeholder="https://"
          defaultValue={product?.imageUrl}
        />
      </label>
      <label>
        <input name="active" type="checkbox" defaultChecked={product?.active ?? true} /> For sale
      </label>
      <p>
        <button type="submit" disabled={save.isPending}>
          {product ? "Save product" : "Add product"}
        </button>
      </p>
      {invalid && <p role="alert">{invalid}</p>}
      {save.error && <p role="alert">Unable to save the product: {save.error.message}</p>}
    </form>
  );
}
