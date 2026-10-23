import { z } from "zod";

export const auditLogFilterSchema = z.object({
  entitaTipo: z.string().trim().max(40).optional(),
  entitaId: z.string().uuid().optional(),
  azione: z.string().trim().max(60).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  perPage: z.coerce.number().int().min(5).max(100).optional().default(25),
});
