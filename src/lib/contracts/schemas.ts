import { z } from "zod";
import {
  ORDER_NOTE_MAX_LENGTH,
  TABLE_NUMBER_MAX,
  TABLE_NUMBER_MIN,
} from "./constants";

export const menuItemKindSchema = z.enum(["food", "drink"]);

export const menuItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Integer pence (UK), e.g. £5.50 => 550 */
  price: z.number().int().nonnegative(),
  kind: menuItemKindSchema,
  description: z.string().optional(),
  /** Stretch: menu availability */
  available: z.boolean().optional(),
});

export const orderStatusSchema = z.enum(["new", "in_progress", "completed"]);

export const orderLineSnapshotSchema = z.object({
  menuItemId: z.string().min(1),
  qty: z.number().int().positive(),
  name: z.string().min(1),
  /** Integer pence (UK), snapshot at submit */
  price: z.number().int().nonnegative(),
  kind: menuItemKindSchema,
});

export const orderSchema = z.object({
  id: z.string().min(1),
  table: z.number().int(),
  /** ISO 8601 datetime string; sort key for staff queue (newest first on API). */
  createdAt: z.string().datetime({ offset: true }),
  lines: z.array(orderLineSnapshotSchema).min(1),
  /** Stretch */
  status: orderStatusSchema.optional(),
  note: z.string().max(ORDER_NOTE_MAX_LENGTH).optional(),
});

export const createOrderLineInputSchema = z.object({
  menuItemId: z.string().min(1),
  qty: z.number().int().positive(),
});

export const createOrderBodySchema = z
  .object({
    table: z.number().int(),
    lines: z.array(createOrderLineInputSchema).min(1),
    note: z.string().max(ORDER_NOTE_MAX_LENGTH).optional(),
  })
  .superRefine((body, ctx) => {
    if (body.table < TABLE_NUMBER_MIN || body.table > TABLE_NUMBER_MAX) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `table must be between ${TABLE_NUMBER_MIN} and ${TABLE_NUMBER_MAX}`,
        path: ["table"],
      });
    }
  });

export const createOrderResponseSchema = z.object({
  orderId: z.string().min(1),
  table: z.number().int(),
  createdAt: z.string().datetime({ offset: true }),
  lines: z.array(orderLineSnapshotSchema).min(1),
  note: z.string().max(ORDER_NOTE_MAX_LENGTH).optional(),
});

export const getMenuResponseSchema = z.object({
  items: z.array(menuItemSchema),
});

export const listOrdersResponseSchema = z.object({
  orders: z.array(orderSchema),
});
