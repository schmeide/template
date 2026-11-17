import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useHashPath } from "../App.tsx";
import { useTRPC } from "../trpc.ts";
import { ActingAs } from "./ActingAs.tsx";
import { MyRequests, ReviewQueue } from "./Lists.tsx";
import { NewRequest } from "./NewRequest.tsx";
import { PublicForm } from "./PublicForm.tsx";
import { RequestDetail } from "./RequestDetail.tsx";
import { TypeSettings } from "./TypeSettings.tsx";
import "./requests.css";

const views = [
  { path: "", title: "My requests" },
  { path: "new", title: "New request" },
  { path: "review", title: "Review" },
  { path: "types", title: "Request types" },
] as const;

const storageKey = "requests.actingAs";

// ponytail: who you are is a name picked here and kept in this browser, so anyone can act as
// anyone. Use the signed-in user instead once platform sign-in exists (schmeide/schmeide.app#84).
const readStored = (): number | undefined => {
  try {
    const id = Number(window.localStorage.getItem(storageKey));
    return Number.isInteger(id) && id > 0 ? id : undefined;
  } catch {
    return undefined;
  }
};

const useActingAs = () => {
  const [actorId, setActorId] = useState(readStored);
  const choose = (id: number) => {
    setActorId(id);
    try {
      window.localStorage.setItem(storageKey, String(id));
    } catch {
      // Storage can be blocked; the choice then lasts until the page reloads.
    }
  };
  return [actorId, choose] as const;
};

// #/requests, #/requests/new, #/requests/review, #/requests/types, #/requests/<id>, and the public
// form at #/requests/form/<token>.
// ponytail: the public form still shows the app menu; with no sign-in every visitor is staff
// anyway. Once sign-in exists, serve it outside sign-in and without the menu.
export function Requests() {
  const [, first = "", second] = useHashPath();
  const trpc = useTRPC();
  const people = useQuery(trpc.requests.people.queryOptions());
  const [actorId, setActorId] = useActingAs();
  const actor = people.data?.find((person) => person.id === actorId);

  if (first === "form" && second) return <PublicForm token={second} />;

  const id = Number(first);
  const view =
    first === "types" ? (
      <TypeSettings people={people.data ?? []} />
    ) : !actor ? (
      <main>
        <h1>Requests</h1>
        <p>Choose who you are acting as, or add your name, to see and file requests.</p>
      </main>
    ) : first === "new" ? (
      <NewRequest actor={actor} />
    ) : first === "review" ? (
      <ReviewQueue actor={actor} />
    ) : first && Number.isInteger(id) ? (
      <RequestDetail key={id} id={id} actor={actor} />
    ) : (
      <MyRequests actor={actor} />
    );

  return (
    <>
      <nav aria-label="Request views" className="request-views">
        <ul>
          {views.map(({ path, title }) => (
            <li key={path}>
              <a
                href={path ? `#/requests/${path}` : "#/requests"}
                aria-current={path === first ? "page" : undefined}
              >
                {title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <ActingAs people={people.data ?? []} actorId={actor?.id} onChoose={setActorId} />
      {view}
    </>
  );
}
