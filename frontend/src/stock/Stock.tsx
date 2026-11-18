import { useHashPath } from "../App.tsx";
import { AccountDetail } from "./AccountDetail.tsx";
import { Balances } from "./Balances.tsx";
import { Summary } from "./Summary.tsx";
import "./stock.css";

const views = [
  { path: "", title: "Items" },
  { path: "summary", title: "Period summary" },
] as const;

// #/stock (every item and its balance), #/stock/summary and #/stock/<id>.
export function Stock() {
  const [, first = ""] = useHashPath();
  const id = Number(first);
  const view =
    first === "summary" ? (
      <Summary />
    ) : first && Number.isInteger(id) ? (
      <AccountDetail key={id} id={id} />
    ) : (
      <Balances />
    );

  return (
    <>
      <nav aria-label="Stock views" className="stock-views">
        <ul>
          {views.map(({ path, title }) => (
            <li key={path}>
              <a
                href={path ? `#/stock/${path}` : "#/stock"}
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
