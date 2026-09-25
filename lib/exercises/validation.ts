import { z } from "zod";

export const exerciseIdSchema = z.string().uuid("IDを確認してください。");
