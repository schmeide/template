import { useHashPath } from "../App.tsx";
import { AssetDetail } from "./AssetDetail.tsx";
import { AssetList } from "./AssetList.tsx";
import { Categories } from "./Categories.tsx";
import { Import } from "./Import.tsx";
import { NewAsset } from "./NewAsset.tsx";
import "./assets.css";

const views = [
  { path: "", title: "All assets" },
  { path: "expiring", title: "Expiring" },
  { path: "new", title: "Add an asset" },
  { path: "import", title: "Import" },
  { path: "categories", title: "Categories" },
] as const;

// #/assets (the list), #/assets/<view> and #/assets/<id>.
export function Assets() {
  const [, first = ""] = useHashPath();
  const id = Number(first);
  const view =
    first === "expiring" ? (
      <AssetList key="expiring" expiring />
    ) : first === "new" ? (
      <NewAsset />
    ) : first === "import" ? (
      <Import />
    ) : first === "categories" ? (
      <Categories />
    ) : first && Number.isInteger(id) ? (
      <AssetDetail key={id} id={id} />
    ) : (
      <AssetList key="all" />
    );

  return (
    <>
      <nav aria-label="Asset views" className="assets-views">
        <ul>
          {views.map(({ path, title }) => (
            <li key={path}>
              <a
                href={path ? `#/assets/${path}` : "#/assets"}
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
