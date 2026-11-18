import { newPersonSchema } from "../db/schema/people.ts";
import { addPerson, listPeople } from "../services/people.ts";
import { procedure, router } from "../trpc.ts";

// ponytail: open to every visitor until sign-in exists (schmeide/schmeide.app#84).
export const peopleRouter = router({
  list: procedure.query(({ ctx }) => listPeople(ctx.db)),
  add: procedure.input(newPersonSchema).mutation(({ ctx, input }) => addPerson(ctx.db, input)),
});
