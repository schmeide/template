import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { formatMoney } from "../money/money.ts";
import { useTRPC } from "../trpc.ts";
import { addToCart, maxQuantity } from "./cart.ts";
import { focusOnMount, imageSource } from "./format.ts";

export function ProductPage({ id }: { readonly id: number }) {
  const trpc = useTRPC();
  const product = useQuery(trpc.orders.product.queryOptions({ id }));
  const [added, setAdded] = useState("");

  if (product.error && product.error.data?.code !== "NOT_FOUND") {
    return (
      <main>
        <h1 ref={focusOnMount} tabIndex={-1}>
          Unable to load the product
        </h1>
        <p role="alert">{product.error.message}</p>
        <p>
          <button type="button" onClick={() => void product.refetch()}>
            Try again
          </button>
        </p>
      </main>
    );
  }
  if (product.error) {
    return (
      <main>
        <h1 ref={focusOnMount} tabIndex={-1}>
          Not for sale
        </h1>
        <p>
          This product is not for sale now. <a href="#/shop">See what is</a>.
        </p>
      </main>
    );
  }
  if (!product.data) return <main aria-busy="true" />;
  const { name, description, price, imageUrl, category, currency } = product.data;
  const image = imageSource(imageUrl);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const quantity = Number(new FormData(event.currentTarget).get("quantity"));
    addToCart(id, quantity);
    setAdded(`Added ${quantity} × ${name} to your cart.`);
  };

  return (
    <main className="order-product">
      <h1 ref={focusOnMount} tabIndex={-1}>
        {name}
      </h1>
      {category && <p className="order-hint">{category}</p>}
      {image && <img src={image} alt="" loading="lazy" />}
      <p className="order-price">{formatMoney(price, currency)}</p>
      {description && <p className="order-description">{description}</p>}
      <form onSubmit={onSubmit} className="order-add">
        <label>
          Quantity{" "}
          <input
            name="quantity"
            type="number"
            required
            min={1}
            max={maxQuantity}
            step={1}
            defaultValue={1}
            inputMode="numeric"
          />
        </label>
        <button type="submit">Add to cart</button>
      </form>
      <p role="status" className="order-status-message">
        {added && (
          <>
            {added} <a href="#/shop/cart">Go to cart</a>
          </>
        )}
      </p>
    </main>
  );
}
