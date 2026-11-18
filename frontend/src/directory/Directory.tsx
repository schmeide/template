import { useHashPath } from "../App.tsx";
import { NewStaff, StaffDetail } from "./StaffPage.tsx";
import { StaffList } from "./StaffList.tsx";
import "./directory.css";

const views = [
  { path: "", title: "All staff" },
  { path: "new", title: "Add a person" },
] as const;

// #/directory (the list), #/directory/new and #/directory/<person id>.
export function Directory() {
  const [, first = ""] = useHashPath();
  const id = Number(first);
  const view =
    first === "new" ? (
      <NewStaff />
    ) : first && Number.isInteger(id) ? (
      <StaffDetail key={id} id={id} />
    ) : (
      <StaffList />
    );

  return (
    <>
      <nav aria-label="Staff views" className="directory-views">
        <ul>
          {views.map(({ path, title }) => (
            <li key={path}>
              <a
                href={path ? `#/directory/${path}` : "#/directory"}
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
