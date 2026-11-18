import { createContext, useContext, useSyncExternalStore, type ComponentType } from "react";

export type Page = {
  readonly path: string;
  readonly title: string;
  readonly Component: ComponentType;
};

// A view one feature adds to another feature's page, such as a link between two features. The
// page names the place and passes the id of the record it shows; the view does the rest.
export type Slot = {
  readonly slot: string;
  readonly Component: ComponentType<{ readonly id: number }>;
};

const SlotsContext = createContext<readonly Slot[]>([]);

// Renders every view added to the place `name`, or nothing when none is kept.
export function Slots({ name, id }: { readonly name: string; readonly id: number }) {
  return useContext(SlotsContext)
    .filter(({ slot }) => slot === name)
    .map(({ Component }, index) => <Component key={index} id={id} />);
}

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

export function App({
  pages,
  slots = [],
}: {
  readonly pages: readonly Page[];
  readonly slots?: readonly Slot[];
}) {
  const [path] = useHashPath();
  const page = pages.find((candidate) => candidate.path === path) ?? pages[0];

  return (
    <SlotsContext value={slots}>
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
    </SlotsContext>
  );
}
