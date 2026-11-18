# People

The names people pick to say who they are, for shapes that record who did something. It has a table and a router
but no page: nobody keeps it on its own, and `make shape/keep` refuses to. It comes with the shapes that require it
(`requests` and `handbook`).

## What it has

- **People** (`approval_people`): an id and a unique name. The table keeps the name it had when the `requests` shape
  owned it, because renaming a table in a migration drops and recreates it.
- **`listPeople`** and **`addPerson`** (`backend/src/services/people.ts`), served as `people.list` and `people.add`.
  Adding a name that exists returns that person.
- **`ActingAs`** and **`useActingAs`** (`frontend/src/people/ActingAs.tsx`): an "Acting as" picker with a form to
  add a name, and a hook that keeps the chosen id in the browser's local storage (`people.actingAs`). Each shape
  passes its own hint saying what the name is used for.

## Who is who

There is no sign-in yet (schmeide/schmeide.app#84). Anyone can pick any name, so every rule that rests on who did
something is only as strong as that choice. Once sign-in exists, take the person from the signed-in user in the tRPC
context, drop `actorId` from the inputs of the shapes that use it, point `approval_people` at the platform's users,
and remove the picker. These places carry a `ponytail:` comment.

## Limits

- People are not renamed or deleted.
- Every visitor sees every name.
