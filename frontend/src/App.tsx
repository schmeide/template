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
const currentPath = () => window.location.hash.replace(/^#\/?/, "").split("/")[0];

export function App({ pages }: { readonly pages: readonly Page[] }) {
  const path = useSyncExternalStore(subscribe, currentPath);
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
