import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useTRPC } from "../trpc.ts";
import { focusOnMount } from "./format.ts";

// The categories assets can be filed under. ponytail: no rename or delete; add them when a
// project needs them (delete only an unused category, since records point at it).
export function Categories() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const categories = useQuery(trpc.assets.categories.queryOptions());
  const create = useMutation(
    trpc.assets.createCategory.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: trpc.assets.categories.queryKey() }),
    })
  );

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    create.mutate(
      { name: String(new FormData(form).get("name")) },
      { onSuccess: () => form.reset() }
    );
  };

  return (
    <main>
      <h1 ref={focusOnMount} tabIndex={-1}>
        Categories
      </h1>
      {categories.error && (
        <p role="alert">Unable to load categories: {categories.error.message}</p>
      )}
      {categories.data && (
        <ul>
          {categories.data.map((category) => (
            <li key={category.id}>{category.name}</li>
          ))}
        </ul>
      )}
      <form onSubmit={onSubmit} aria-labelledby="assets-add-category" className="assets-form">
        <h2 id="assets-add-category">Add a category</h2>
        <label>
          Name <input name="name" required maxLength={100} autoComplete="off" />
        </label>
        <p>
          <button type="submit" disabled={create.isPending}>
            Add category
          </button>
        </p>
        {create.error && <p role="alert">Unable to add the category: {create.error.message}</p>}
      </form>
    </main>
  );
}
