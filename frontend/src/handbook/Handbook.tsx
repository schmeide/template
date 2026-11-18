import { useQuery } from "@tanstack/react-query";
import { useHashPath } from "../App.tsx";
import { ActingAs, useActingAs } from "../people/ActingAs.tsx";
import { useTRPC } from "../trpc.ts";
import { Contents } from "./Contents.tsx";
import { PageEditor } from "./PageEditor.tsx";
import { PageView } from "./PageView.tsx";
import "./handbook.css";

// #/handbook (contents and search), #/handbook/new, #/handbook/<id> and #/handbook/<id>/edit.
export function Handbook() {
  const [, first = "", second] = useHashPath();
  const trpc = useTRPC();
  const people = useQuery(trpc.people.list.queryOptions());
  const [actorId, setActorId] = useActingAs();
  const actor = people.data?.find((person) => person.id === actorId);
  const id = Number(first);

  const view =
    first === "new" ? (
      <PageEditor key="new" actor={actor} />
    ) : first && Number.isInteger(id) ? (
      second === "edit" ? (
        <PageEditor key={`edit-${id}`} id={id} actor={actor} />
      ) : (
        <PageView key={id} id={id} actor={actor} />
      )
    ) : (
      <Contents />
    );

  return (
    <>
      <ActingAs
        people={people.data ?? []}
        actorId={actor?.id}
        onChoose={setActorId}
        hint="Your name goes on the pages you change and the pages you confirm you have read. Until sign-in exists, anyone can pick any name."
      />
      {view}
    </>
  );
}
