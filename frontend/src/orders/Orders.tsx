import { useHashPath } from "../App.tsx";
import { OrderDetail } from "./OrderDetail.tsx";
import { OrderList } from "./OrderList.tsx";
import { Products } from "./Products.tsx";
import "./orders.css";

const views = [
  { path: "", title: "Orders" },
  { path: "products", title: "Products" },
] as const;

// The staff side: #/orders (by status), #/orders/<id>, #/orders/products and
// #/orders/products/<id> (edit a product).
export function Orders() {
  const [, first = "", second = ""] = useHashPath();
  const id = Number(first);
  const view =
    first === "products" ? (
      <Products editing={second ? Number(second) : undefined} />
    ) : first && Number.isInteger(id) ? (
      <OrderDetail key={id} id={id} />
    ) : (
      <OrderList />
    );

  return (
    <>
      <nav aria-label="Order views" className="order-views">
        <ul>
          {views.map(({ path, title }) => (
            <li key={path}>
              <a
                href={path ? `#/orders/${path}` : "#/orders"}
                aria-current={path === first ? "page" : undefined}
              >
                {title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {view}
    </>
  );
}
