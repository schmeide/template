import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { formatMoney } from "../money/money.ts";
import { useTRPC } from "../trpc.ts";
import { addToCart } from "./cart.ts";
import { focusOnMount, imageSource } from "./format.ts";

// Every active product, searched and filtered by category on the server.
export function Browse() {
  const trpc = useTRPC();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [added, setAdded] = useState("");
  const shop = useQuery(
    trpc.orders.shop.queryOptions(
      { search: search || undefined, category: category || undefined },
      { placeholderData: keepPreviousData }
    )
  );
  const filtered = search !== "" || category !== "";

  return (
    <main>
      <h1 ref={focusOnMount} tabIndex={-1}>
        Shop
      </h1>
      <div className="order-filters" role="search">
        <label>
          Search{" "}
          <input
            type="search"
            value={search}
            maxLength={200}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        {(shop.data?.categories.length ?? 0) > 0 && (
          <label>
            Category{" "}
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="">All categories</option>
              {shop.data?.categories.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p role="status" className="order-status-message">
        {added}
      </p>
      {shop.error && <p role="alert">Unable to load the shop: {shop.error.message}</p>}
      {shop.data?.products.length === 0 &&
        (filtered ? (
          <p>
            Nothing matches.{" "}
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setCategory("");
              }}
            >
              Show everything
            </button>
          </p>
        ) : (
          <p>Nothing is for sale yet. Check back soon.</p>
        ))}
      {shop.data && shop.data.products.length > 0 && (
        <ul className="order-products">
          {shop.data.products.map((product) => {
            const image = imageSource(product.imageUrl);
            return (
              <li key={product.id} className="order-card">
                {image && <img src={image} alt="" loading="lazy" />}
                <h2>
                  <a href={`#/shop/product/${product.id}`}>{product.name}</a>
                </h2>
                <p className="order-price">{formatMoney(product.price, shop.data.currency)}</p>
                <p>
                  <button
                    type="button"
                    onClick={() => {
                      addToCart(product.id, 1);
                      setAdded(`Added ${product.name} to your cart.`);
                    }}
                  >
                    Add to cart <span className="order-visually-hidden">{product.name}</span>
                  </button>
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
