import { useSyncExternalStore, type ComponentType } from "react";

export type Page = {
  readonly path: string;
  readonly title: string;
  readonly Component: ComponentType;
};

// The address is `#/<path>`, so pages need no server routes and no router library.
const subscribe = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};
const currentHash = () => window.location.hash;

// The address split into parts: `#/invoices/7/edit` is ["invoices", "7", "edit"]. A page reads
// the parts after its own path to show a sub-view.
export const useHashPath = (): readonly string[] =>
  useSyncExternalStore(subscribe, currentHash).replace(/^#\/?/, "").split("/");

export function App({ pages }: { readonly pages: readonly Page[] }) {
  const [path] = useHashPath();
  const page = pages.find((candidate) => candidate.path === path) ?? pages[0];

  return (
    <>
      {pages.length > 1 && (
        <nav aria-label="Pages">
          <ul>
            {pages.map(({ path, title }) => (
              <li key={path}>
                <a href={`#/${path}`} aria-current={path === page.path ? "page" : undefined}>
                  {title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <page.Component />
    </>
  );
}
