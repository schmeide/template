import { useHashPath } from "../App.tsx";
import { Browse } from "./Browse.tsx";
import { Cart } from "./Cart.tsx";
import { useCart } from "./cart.ts";
import { OrderStatus } from "./OrderStatus.tsx";
import { ProductPage } from "./ProductPage.tsx";
import "./orders.css";

// The public shop: #/shop (browse), #/shop/product/<id>, #/shop/cart (cart and checkout) and
// #/shop/order/<token> (the customer's order). It needs no sign-in, so it only calls procedures
// that show active products and the visitor's own order.
export function Shop() {
  const [, view = "", param = ""] = useHashPath();
  const cart = useCart();
  const count = cart.reduce((sum, line) => sum + line.quantity, 0);
  const id = Number(param);

  return (
    <>
      <nav aria-label="Shop" className="order-views">
        <ul>
          <li>
            <a href="#/shop" aria-current={view === "" ? "page" : undefined}>
              Products
            </a>
          </li>
          <li>
            <a href="#/shop/cart" aria-current={view === "cart" ? "page" : undefined}>
              Cart ({count})
            </a>
          </li>
        </ul>
      </nav>
      {view === "cart" ? (
        <Cart />
      ) : view === "order" && param ? (
        <OrderStatus key={param} token={param} />
      ) : view === "product" && Number.isInteger(id) ? (
        <ProductPage key={id} id={id} />
      ) : (
        <Browse />
      )}
    </>
  );
}
