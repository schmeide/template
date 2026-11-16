import { drizzle } from "drizzle-orm/node-postgres";

export const createDb = (url: string) => drizzle(url);

export type Db = ReturnType<typeof createDb>;
