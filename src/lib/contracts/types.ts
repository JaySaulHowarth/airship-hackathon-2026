import type { z } from "zod";
import {
  createOrderBodySchema,
  createOrderLineInputSchema,
  createOrderResponseSchema,
  getMenuResponseSchema,
  listOrdersResponseSchema,
  menuItemKindSchema,
  menuItemSchema,
  orderLineSnapshotSchema,
  orderSchema,
  orderStatusSchema,
} from "./schemas";

export type MenuItemKind = z.infer<typeof menuItemKindSchema>;
export type MenuItem = z.infer<typeof menuItemSchema>;

export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type OrderLineSnapshot = z.infer<typeof orderLineSnapshotSchema>;
/** Persisted order line (snapshot at submit); alias for plan wording “order line”. */
export type OrderLine = OrderLineSnapshot;
export type Order = z.infer<typeof orderSchema>;

export type CreateOrderLineInput = z.infer<typeof createOrderLineInputSchema>;
export type CreateOrderBody = z.infer<typeof createOrderBodySchema>;
export type CreateOrderResponse = z.infer<typeof createOrderResponseSchema>;

export type GetMenuResponse = z.infer<typeof getMenuResponseSchema>;
export type ListOrdersResponse = z.infer<typeof listOrdersResponseSchema>;
