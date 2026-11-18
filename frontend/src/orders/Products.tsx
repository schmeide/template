import { useQuery } from "@tanstack/react-query";
import { formatMoney } from "../money/money.ts";
import { useTRPC } from "../trpc.ts";
import { focusOnMount } from "./format.ts";
import { ProductForm } from "./ProductForm.tsx";

// Every product, for sale or not, with a form to add one; or the form to edit one.
export function Products({ editing }: { readonly editing?: number }) {
  const trpc = useTRPC();
  const products = useQuery(trpc.orders.products.queryOptions({}));
  const currency = products.data?.currency ?? "USD";
  const categories = [
    ...new Set(products.data?.products.map((product) => product.category).filter(Boolean)),
  ].sort();

  if (editing !== undefined) {
    const product = products.data?.products.find((candidate) => candidate.id === editing);
    if (products.error) {
      return (
        <main>
          <h1 ref={focusOnMount} tabIndex={-1}>
            Unable to load the product
          </h1>
          <p role="alert">{products.error.message}</p>
          <p>
            <button type="button" onClick={() => void products.refetch()}>
              Try again
            </button>
          </p>
        </main>
      );
    }
    if (!products.data) return <main aria-busy="true" />;
    if (!product) {
      return (
        <main>
          <h1 ref={focusOnMount} tabIndex={-1}>
            Product not found
          </h1>
          <p>
            <a href="#/orders/products">See every product</a>.
          </p>
        </main>
      );
    }
    return (
      <main>
        <h1 ref={focusOnMount} tabIndex={-1}>
          Edit {product.name}
        </h1>
        <ProductForm
          key={product.id}
          product={product}
          currency={currency}
          categories={categories}
          onSaved={() => window.location.assign("#/orders/products")}
        />
        <p>
          <a href="#/orders/products">Back to products without saving</a>
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1 ref={focusOnMount} tabIndex={-1}>
        Products
      </h1>
      {products.error && <p role="alert">Unable to load products: {products.error.message}</p>}
      {products.data?.products.length === 0 && (
        <p>No products yet. Add the first one below; it shows in the shop straight away.</p>
      )}
      {products.data && products.data.products.length > 0 && (
        <div className="order-scroll">
          <table className="order-table">
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col">Category</th>
                <th scope="col" className="order-number">
                  Price
                </th>
                <th scope="col">In the shop</th>
              </tr>
            </thead>
            <tbody>
              {products.data.products.map((product) => (
                <tr key={product.id}>
                  <td>
                    <a href={`#/orders/products/${product.id}`}>{product.name}</a>
                  </td>
                  <td>{product.category}</td>
                  <td className="order-number">{formatMoney(product.price, currency)}</td>
                  <td>{product.active ? "For sale" : "Hidden"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h2>Add a product</h2>
      <ProductForm currency={currency} categories={categories} />
    </main>
  );
}
