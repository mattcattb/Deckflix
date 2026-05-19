import {z} from "zod";
import {NotFoundException} from "../common/errors";

export const parseJson = <T>(
  raw: string,
  schema: z.ZodType<T>,
  label?: string,
): T => {
  let errMessage = label;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    if (parsed.success) {
      return parsed.data;
    }
  } catch (err) {
    errMessage = err instanceof Error ? err.message : "Failed to parse JSON";
  }

  throw new NotFoundException(label ?? errMessage);
};
