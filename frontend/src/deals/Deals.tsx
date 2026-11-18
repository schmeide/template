import { useHashPath } from "../App.tsx";
import { Board } from "./Board.tsx";
import { DealDetail } from "./DealDetail.tsx";
import { DealTable } from "./DealTable.tsx";
import { StageSettings } from "./StageSettings.tsx";
import "./deals.css";

const views = [
  { path: "", title: "Board" },
  { path: "table", title: "Table" },
  { path: "stages", title: "Stages" },
] as const;

// #/deals (the board), #/deals/table, #/deals/stages and #/deals/<id>.
export function Deals() {
  const [, first = ""] = useHashPath();
  const id = Number(first);
  const view =
    first === "table" ? (
      <DealTable />
    ) : first === "stages" ? (
      <StageSettings />
    ) : first && Number.isInteger(id) ? (
      <DealDetail key={id} id={id} />
    ) : (
      <Board />
    );

  return (
    <>
      <nav aria-label="Deal views" className="deal-views">
        <ul>
          {views.map(({ path, title }) => (
            <li key={path}>
              <a
                href={path ? `#/deals/${path}` : "#/deals"}
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
