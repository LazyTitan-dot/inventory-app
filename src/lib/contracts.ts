import { z } from 'zod';

// Keep validation compatible with the app's strict script-src policy.
z.config({ jitless: true });

const id = z.string().uuid();
const timestamp = z.string();
const optionalText = z.string().nullable();
const amount = z.number().finite();
export const roleSchema = z.enum(['owner', 'admin', 'sales', 'inventory', 'viewer']);
export type Role = z.infer<typeof roleSchema>;
export const productSchema = z.object({
  id,
  category: z.string(),
  brand: z.string(),
  model: z.string(),
  description: z.string(),
  warranty_months: z.number(),
  images: z.array(z.string()),
  active: z.boolean(),
  created_at: timestamp,
  updated_at: timestamp,
});
export const variantSchema = z.object({
  id,
  product_id: id,
  name: z.string(),
  sku: z.string(),
  barcode: optionalText,
  cost: amount.optional(),
  price: amount,
  min_stock: z.number(),
  reorder_target: z.number(),
  active: z.boolean(),
  created_at: timestamp,
  updated_at: timestamp,
});
export const stockSchema = z.object({
  variant_id: id,
  available: z.number(),
  quarantine: z.number(),
  updated_at: timestamp,
});
export const contactSchema = z.object({
  id,
  kind: z.enum(['customer', 'supplier']),
  name: z.string(),
  email: optionalText,
  phone: optionalText,
  tax_id: optionalText,
  address: optionalText,
  notes: optionalText,
  active: z.boolean(),
  created_at: timestamp,
  updated_at: timestamp,
});
export const addressSnapshotSchema = z.object({
  street: z.string(),
  sector: z.string(),
  city: z.string(),
  province: z.string(),
  phone: z.string(),
  reference: z.string(),
});
export const customerAddressSchema = addressSnapshotSchema.extend({
  id,
  contact_id: id,
  label: z.string(),
  is_default: z.boolean(),
  active: z.boolean(),
  created_at: timestamp,
  updated_at: timestamp,
});
export const documentSchema = z.object({
  id,
  number: z.string(),
  type: z.enum(['sale', 'purchase', 'quote', 'return']),
  status: z.string(),
  status_reason: z.string().optional(),
  expected_at: z.string().nullable().optional(),
  closed_short: z.boolean().optional(),
  contact_id: id.nullable(),
  contact_snapshot: z.record(z.string(), z.unknown()),
  subtotal: amount,
  discount: amount,
  tax_rate: amount,
  tax: amount,
  total: amount,
  currency: z.literal('DOP'),
  payment_method: optionalText,
  tendered: amount.nullable(),
  change_amount: amount.nullable(),
  notes: optionalText,
  parent_id: id.nullable(),
  promotion_id: id.nullable(),
  expires_at: timestamp.nullable(),
  created_by: id.nullable(),
  created_at: timestamp,
  updated_at: timestamp,
  legacy: z.record(z.string(), z.unknown()).optional(),
});
export const productSnapshotSchema = z.object({
  category: z.string(),
  brand: z.string(),
  model: z.string(),
  name: z.string(),
  sku: z.string(),
  barcode: optionalText,
  warranty_months: z.number().nullable(),
  warranty_unknown: z.boolean().optional(),
});
export const documentItemSchema = z.object({
  id,
  document_id: id,
  variant_id: id.nullable(),
  product_snapshot: productSnapshotSchema,
  quantity: z.number(),
  received_quantity: z.number(),
  damaged_quantity: z.number().optional(),
  returned_quantity: z.number(),
  unit_price: amount,
  unit_cost: amount.optional(),
  discount: amount,
  tax: amount,
  line_total: amount,
  parent_item_id: id.nullable(),
});
export const movementSchema = z.object({
  id,
  variant_id: id,
  type: z.string(),
  quantity: z.number(),
  bucket: z.enum(['available', 'quarantine']),
  before_quantity: z.number(),
  after_quantity: z.number(),
  reason: z.string(),
  document_id: id.nullable(),
  operation_id: id.nullable(),
  created_by: id.nullable(),
  created_at: timestamp,
});
export const deliverySchema = z.object({
  id,
  sale_id: id,
  status: z.enum(['scheduled', 'in_transit', 'delivered', 'failed', 'cancelled']),
  address: z.string(),
  phone: z.string(),
  contact_name: z.string(),
  customer_address_id: id.nullable().optional(),
  address_snapshot: addressSnapshotSchema.nullable().optional(),
  proof: z.string().optional(),
  scheduled_at: timestamp,
  assignee: optionalText,
  notes: optionalText,
  received_by: optionalText,
  delivered_at: timestamp.nullable(),
  legacy: z.record(z.string(), z.unknown()).optional(),
  history: z.array(
    z.object({ at: timestamp, actor: id.nullable(), status: z.string(), note: optionalText, received_by: z.string().optional(), proof: z.string().optional() }),
  ),
  created_at: timestamp,
  updated_at: timestamp,
});
export const purchaseReceiptSchema = z.object({
  id,
  purchase_id: id,
  operation_id: id,
  received_by: id,
  notes: z.string(),
  items: z.array(z.object({
    item_id: id,
    variant_id: id,
    quantity: z.number(),
    damaged_quantity: z.number(),
    unit_cost: amount,
  })),
  created_at: timestamp,
});
export const promotionSchema = z.object({
  id,
  name: z.string(),
  code: optionalText,
  kind: z.enum(['percent', 'fixed']),
  value: amount,
  starts_at: timestamp,
  ends_at: timestamp,
  category: optionalText,
  product_ids: z.array(id),
  active: z.boolean(),
  created_at: timestamp,
  updated_at: timestamp,
});
export const settingsSchema = z.object({
  id: z.string(),
  business_name: z.string(),
  tax_id: optionalText,
  phone: optionalText,
  email: optionalText,
  address: optionalText,
  currency: z.literal('DOP'),
  timezone: z.literal('America/Santo_Domingo'),
  tax_rate: amount,
  max_sale_discount_percent: amount,
  receipt_footer: optionalText,
  updated_at: timestamp,
});
export const teamSchema = z.object({
  user_id: id,
  email: z.string(),
  display_name: z.string(),
  role: roleSchema,
  active: z.boolean(),
  created_at: timestamp,
  updated_at: timestamp,
});
export const auditSchema = z.object({
  id: z.number(),
  action: z.string(),
  entity_id: id.nullable(),
  operation_id: id.nullable(),
  actor_id: id.nullable(),
  actor_email: optionalText,
  details: z.record(z.string(), z.unknown()),
  created_at: timestamp,
});
export const bootstrapSchema = z.object({
  profile: z.object({ id, email: z.string(), display_name: z.string(), role: roleSchema }),
  permissions: z.object({
    manage_catalog: z.boolean(),
    view_costs: z.boolean(),
    sell: z.boolean(),
    purchase: z.boolean(),
    refund: z.boolean(),
    manage_business: z.boolean(),
    manage_team: z.boolean(),
    view_audit: z.boolean(),
  }),
  settings: settingsSchema,
  products: z.array(productSchema),
  variants: z.array(variantSchema),
  stocks: z.array(stockSchema),
  contacts: z.array(contactSchema),
  customer_addresses: z.array(customerAddressSchema).optional(),
  purchase_receipts: z.array(purchaseReceiptSchema).optional(),
  features: z.array(z.string()).optional(),
  documents: z.array(documentSchema),
  document_items: z.array(documentItemSchema),
  movements: z.array(movementSchema),
  deliveries: z.array(deliverySchema),
  promotions: z.array(promotionSchema),
  audit: z.array(auditSchema),
  team: z.array(teamSchema),
});
export type RetailData = z.infer<typeof bootstrapSchema>;
export type Product = z.infer<typeof productSchema>;
export type Variant = z.infer<typeof variantSchema>;
export type Contact = z.infer<typeof contactSchema>;
export type AddressSnapshot = z.infer<typeof addressSnapshotSchema>;
export type CustomerAddress = z.infer<typeof customerAddressSchema>;
export type PurchaseReceipt = z.infer<typeof purchaseReceiptSchema>;
export type RetailDocument = z.infer<typeof documentSchema>;
export type DocumentItem = z.infer<typeof documentItemSchema>;
export type Delivery = z.infer<typeof deliverySchema>;
export type Promotion = z.infer<typeof promotionSchema>;
export type Action =
  | 'save_product'
  | 'archive_product'
  | 'save_contact'
  | 'archive_contact'
  | 'save_customer_address'
  | 'archive_customer_address'
  | 'set_default_address'
  | 'adjust_stock'
  | 'create_sale'
  | 'create_purchase'
  | 'receive_purchase'
  | 'cancel_purchase'
  | 'close_purchase_short'
  | 'confirm_purchase_draft'
  | 'create_quote'
  | 'update_quote'
  | 'cancel_quote'
  | 'convert_quote'
  | 'return_sale'
  | 'void_sale'
  | 'save_delivery'
  | 'status_delivery'
  | 'save_promotion'
  | 'save_settings'
  | 'set_member_role'
  | 'link_historical_item'
  | 'cancel_legacy_sale';
export interface CommandResult {
  operation_id: string;
  action: Action;
  entity_id: string | null;
  result: Record<string, unknown>;
}
