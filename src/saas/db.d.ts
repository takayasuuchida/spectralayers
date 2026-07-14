// SaaS スキーマ (saas.*) の型定義。
// 自動生成の Supabase typegen が現状 public 固定のため手書き。
// 変更したら apply_migration と同時にここも更新すること。

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type AccountPlan = "free" | "standard" | "business" | "multi";
export type AccountStatus = "active" | "suspended" | "canceled";
export type StoreIndustry = "cabaret" | "lounge" | "snack" | "oppub" | "other";
export type StoreStatus = "active" | "paused" | "closed";
export type StaffRole = "owner" | "manager" | "floor" | "catch" | "viewer";
export type StaffStatus = "active" | "inactive";
export type CastRank = "regular" | "helper" | "shimei" | "vip";
export type CastStatus = "active" | "off" | "retired";
export type AttendanceStatus = "scheduled" | "present" | "late" | "absent" | "left";
export type CustomerRank = "regular" | "vip" | "black" | "watch";
export type AlertSeverity = "info" | "warn" | "danger";
export type AlertCategory = "behavior" | "payment" | "harassment" | "ng_cast" | "other";
export type TableStatus = "active" | "disabled" | "hidden";
export type SessionStatus = "active" | "extended" | "closed" | "void";
export type SessionCastRole = "main" | "help" | "shimei" | "free";
export type AssignedBy = "auto" | "manual" | "shimei";
export type ProductCategory = "drink" | "bottle" | "shot" | "food" | "set" | "other";
export type MovementType = "in" | "out" | "waste" | "adjust" | "sold";
export type BottleKeepStatus = "active" | "empty" | "expired" | "disposed";
export type PaymentMethod = "cash" | "card" | "qr" | "transfer" | "ic" | "other" | "tab";
export type SalaryPeriodStatus = "open" | "locked" | "paid";

type Timestamp = string;
type DateOnly = string;
type UUID = string;

export interface Account {
  id: UUID;
  name: string;
  plan: AccountPlan;
  billing_email: string | null;
  status: AccountStatus;
  trial_ends_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}
export type AccountInsert = Partial<Pick<Account, "id" | "plan" | "status" | "billing_email" | "trial_ends_at" | "created_at" | "updated_at">> & { name: string };
export type AccountUpdate = Partial<Account>;

export interface Store {
  id: UUID;
  account_id: UUID;
  name: string;
  industry: StoreIndustry;
  slug: string;
  tax_rate: number;
  timezone: string;
  opens_at: string | null;
  closes_at: string | null;
  status: StoreStatus;
  created_at: Timestamp;
  updated_at: Timestamp;
}
export type StoreInsert = Partial<Pick<Store, "id" | "industry" | "tax_rate" | "timezone" | "opens_at" | "closes_at" | "status" | "created_at" | "updated_at">> & { account_id: UUID; name: string; slug: string };
export type StoreUpdate = Partial<Store>;

export interface Staff {
  id: UUID;
  account_id: UUID;
  store_id: UUID | null;
  auth_user_id: UUID | null;
  display_name: string;
  role: StaffRole;
  email: string | null;
  phone: string | null;
  status: StaffStatus;
  created_at: Timestamp;
  updated_at: Timestamp;
}
export type StaffInsert = Partial<Pick<Staff, "id" | "store_id" | "auth_user_id" | "email" | "phone" | "status" | "created_at" | "updated_at">> & { account_id: UUID; display_name: string; role: StaffRole };
export type StaffUpdate = Partial<Staff>;

export interface Cast {
  id: UUID;
  store_id: UUID;
  display_name: string;
  real_name: string | null;
  rank: CastRank;
  genre: string[];
  birthday: DateOnly | null;
  hired_at: DateOnly | null;
  phone: string | null;
  status: CastStatus;
  avatar_url: string | null;
  memo: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}
export type CastInsert = Partial<Omit<Cast, "id" | "created_at" | "updated_at" | "store_id" | "display_name">> & { store_id: UUID; display_name: string };
export type CastUpdate = Partial<Cast>;

export interface CastPayRule {
  id: UUID;
  cast_id: UUID;
  base_hourly_yen: number;
  drink_back_rate: number;
  bottle_back_rate: number;
  shimei_back_yen: number;
  penalty_rate: number;
  effective_from: DateOnly;
  effective_to: DateOnly | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface CastAttendance {
  id: UUID;
  cast_id: UUID;
  store_id: UUID;
  work_date: DateOnly;
  clock_in_at: Timestamp | null;
  clock_out_at: Timestamp | null;
  break_minutes: number;
  status: AttendanceStatus;
  memo: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface Customer {
  id: UUID;
  store_id: UUID;
  display_name: string;
  furigana: string | null;
  phone: string | null;
  email: string | null;
  birthday: DateOnly | null;
  occupation: string | null;
  company: string | null;
  address: string | null;
  first_visit: DateOnly | null;
  last_visit: DateOnly | null;
  visit_count: number;
  total_spent: number;
  rank: CustomerRank;
  preference: string[];
  ng_casts: UUID[];
  favorite_casts: UUID[];
  favorite_drinks: string[];
  memo: string | null;
  photo_url: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface CustomerAlert {
  id: UUID;
  customer_id: UUID;
  store_id: UUID;
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  detail: string | null;
  created_by: UUID | null;
  resolved_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface TableRow {
  id: UUID;
  store_id: UUID;
  code: string;
  label: string | null;
  seats: number;
  layout_x: number | null;
  layout_y: number | null;
  group_id: string | null;
  is_locked: boolean;
  sort_order: number;
  status: TableStatus;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface TableSession {
  id: UUID;
  store_id: UUID;
  table_id: UUID;
  business_date: DateOnly;
  started_at: Timestamp;
  ended_at: Timestamp | null;
  planned_minutes: number;
  set_fee_yen: number;
  head_count: number;
  status: SessionStatus;
  boss_customer_id: UUID | null;
  memo: string | null;
  created_by: UUID | null;
  closed_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface SessionGuest {
  id: UUID;
  session_id: UUID;
  customer_id: UUID | null;
  guest_name: string | null;
  is_boss: boolean;
  seat_no: number | null;
  joined_at: Timestamp;
  left_at: Timestamp | null;
  created_at: Timestamp;
}

export interface SessionCast {
  id: UUID;
  session_id: UUID;
  cast_id: UUID;
  rotation_no: number;
  role: SessionCastRole;
  started_at: Timestamp;
  ended_at: Timestamp | null;
  assigned_by: AssignedBy;
  score: number | null;
  created_at: Timestamp;
}

export interface DrinkOrder {
  id: UUID;
  store_id: UUID;
  session_id: UUID;
  cast_id: UUID | null;
  guest_id: UUID | null;
  product_id: UUID | null;
  item_name: string;
  category: ProductCategory;
  unit_price: number;
  quantity: number;
  back_rate: number;
  memo: string | null;
  created_at: Timestamp;
}

export interface Product {
  id: UUID;
  store_id: UUID;
  name: string;
  category: ProductCategory;
  price_yen: number;
  cost_yen: number;
  back_rate: number;
  sku: string | null;
  size_ml: number | null;
  taxable: boolean;
  is_active: boolean;
  sort_order: number;
  memo: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface Inventory {
  id: UUID;
  store_id: UUID;
  product_id: UUID;
  qty_current: number;
  qty_min: number;
  qty_max: number | null;
  updated_at: Timestamp;
}

export interface InventoryMovement {
  id: UUID;
  store_id: UUID;
  product_id: UUID;
  movement_type: MovementType;
  qty: number;
  session_id: UUID | null;
  order_id: UUID | null;
  cost_yen: number | null;
  memo: string | null;
  created_by: UUID | null;
  created_at: Timestamp;
}

export interface BottleKeep {
  id: UUID;
  store_id: UUID;
  customer_id: UUID;
  product_id: UUID | null;
  bottle_label: string;
  opened_at: DateOnly;
  expires_at: DateOnly | null;
  remaining_pct: number;
  location: string | null;
  status: BottleKeepStatus;
  memo: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface SessionBill {
  id: UUID;
  session_id: UUID;
  store_id: UUID;
  business_date: DateOnly;
  subtotal_yen: number;
  set_fee_yen: number;
  service_fee_yen: number;
  shimei_fee_yen: number;
  extend_fee_yen: number;
  discount_yen: number;
  tax_yen: number;
  total_yen: number;
  payment_method: PaymentMethod;
  paid_at: Timestamp | null;
  closed_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ShiftReport {
  id: UUID;
  store_id: UUID;
  business_date: DateOnly;
  opened_at: Timestamp | null;
  closed_at: Timestamp | null;
  head_count: number;
  set_count: number;
  total_sales_yen: number;
  cash_yen: number;
  card_yen: number;
  other_yen: number;
  cost_yen: number;
  payroll_yen: number;
  weather: string | null;
  memo: string | null;
  closed_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface SalaryPeriod {
  id: UUID;
  store_id: UUID;
  period_start: DateOnly;
  period_end: DateOnly;
  status: SalaryPeriodStatus;
  locked_at: Timestamp | null;
  paid_at: Timestamp | null;
  memo: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface SalaryRecord {
  id: UUID;
  period_id: UUID;
  cast_id: UUID;
  work_hours: number;
  base_yen: number;
  drink_back_yen: number;
  bottle_back_yen: number;
  shimei_back_yen: number;
  bonus_yen: number;
  penalty_yen: number;
  tax_yen: number;
  net_yen: number;
  breakdown: Json;
  memo: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface HousePolicy {
  id: UUID;
  store_id: UUID;
  key: string;
  value: Json;
  weight: number;
  is_active: boolean;
  memo: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface AuditLog {
  id: UUID;
  account_id: UUID | null;
  store_id: UUID | null;
  actor_id: UUID | null;
  actor_role: string | null;
  action: string;
  resource: string;
  resource_id: UUID | null;
  before_data: Json | null;
  after_data: Json | null;
  ip: string | null;
  user_agent: string | null;
  created_at: Timestamp;
}

// RPC 返り値

export interface SetupAccountResult {
  account_id: UUID;
  store_id: UUID;
  staff_id: UUID;
  already_setup: boolean;
}

export interface MyContextUnauthenticated {
  authenticated: false;
}
export interface MyContextAuthenticated {
  authenticated: true;
  staff: {
    staff_id: UUID;
    account_id: UUID;
    store_id: UUID | null;
    role: StaffRole;
    display_name: string;
    email: string | null;
  };
  account: Account;
  current_store: Store | null;
  accessible_stores: Store[];
}
export type MyContext = MyContextUnauthenticated | MyContextAuthenticated;

// Database 型（Supabase の Database 型互換の形）
export type Database = {
  saas: {
    Tables: {
      accounts:             { Row: Account;           Insert: AccountInsert;  Update: AccountUpdate;  Relationships: [] };
      stores:               { Row: Store;             Insert: StoreInsert;    Update: StoreUpdate;    Relationships: [] };
      staff:                { Row: Staff;             Insert: StaffInsert;    Update: StaffUpdate;    Relationships: [] };
      casts:                { Row: Cast;              Insert: CastInsert;     Update: CastUpdate;     Relationships: [] };
      cast_pay_rules:       { Row: CastPayRule;       Insert: Partial<CastPayRule> & Pick<CastPayRule, "cast_id" | "base_hourly_yen">;   Update: Partial<CastPayRule>;     Relationships: [] };
      cast_attendance:      { Row: CastAttendance;    Insert: Partial<CastAttendance> & Pick<CastAttendance, "cast_id" | "store_id" | "work_date">; Update: Partial<CastAttendance>; Relationships: [] };
      customers:            { Row: Customer;          Insert: Partial<Customer> & Pick<Customer, "store_id" | "display_name">; Update: Partial<Customer>; Relationships: [] };
      customer_alerts:      { Row: CustomerAlert;     Insert: Partial<CustomerAlert> & Pick<CustomerAlert, "customer_id" | "store_id" | "title">; Update: Partial<CustomerAlert>; Relationships: [] };
      tables:               { Row: TableRow;          Insert: Partial<TableRow> & Pick<TableRow, "store_id" | "code">; Update: Partial<TableRow>; Relationships: [] };
      table_sessions:       { Row: TableSession;      Insert: Partial<TableSession> & Pick<TableSession, "store_id" | "table_id" | "business_date">; Update: Partial<TableSession>; Relationships: [] };
      session_guests:       { Row: SessionGuest;      Insert: Partial<SessionGuest> & Pick<SessionGuest, "session_id">; Update: Partial<SessionGuest>; Relationships: [] };
      session_casts:        { Row: SessionCast;       Insert: Partial<SessionCast> & Pick<SessionCast, "session_id" | "cast_id">; Update: Partial<SessionCast>; Relationships: [] };
      drink_orders:         { Row: DrinkOrder;        Insert: Partial<DrinkOrder> & Pick<DrinkOrder, "store_id" | "session_id" | "item_name">; Update: Partial<DrinkOrder>; Relationships: [] };
      products:             { Row: Product;           Insert: Partial<Product> & Pick<Product, "store_id" | "name">; Update: Partial<Product>; Relationships: [] };
      inventory:            { Row: Inventory;         Insert: Partial<Inventory> & Pick<Inventory, "store_id" | "product_id">; Update: Partial<Inventory>; Relationships: [] };
      inventory_movements:  { Row: InventoryMovement; Insert: Partial<InventoryMovement> & Pick<InventoryMovement, "store_id" | "product_id" | "movement_type" | "qty">; Update: Partial<InventoryMovement>; Relationships: [] };
      bottle_keeps:         { Row: BottleKeep;        Insert: Partial<BottleKeep> & Pick<BottleKeep, "store_id" | "customer_id" | "bottle_label">; Update: Partial<BottleKeep>; Relationships: [] };
      session_bills:        { Row: SessionBill;       Insert: Partial<SessionBill> & Pick<SessionBill, "session_id" | "store_id" | "business_date">; Update: Partial<SessionBill>; Relationships: [] };
      shift_reports:        { Row: ShiftReport;       Insert: Partial<ShiftReport> & Pick<ShiftReport, "store_id" | "business_date">; Update: Partial<ShiftReport>; Relationships: [] };
      salary_periods:       { Row: SalaryPeriod;      Insert: Partial<SalaryPeriod> & Pick<SalaryPeriod, "store_id" | "period_start" | "period_end">; Update: Partial<SalaryPeriod>; Relationships: [] };
      salary_records:       { Row: SalaryRecord;      Insert: Partial<SalaryRecord> & Pick<SalaryRecord, "period_id" | "cast_id">; Update: Partial<SalaryRecord>; Relationships: [] };
      house_policies:       { Row: HousePolicy;       Insert: Partial<HousePolicy> & Pick<HousePolicy, "store_id" | "key" | "value">; Update: Partial<HousePolicy>; Relationships: [] };
      audit_logs:           { Row: AuditLog;          Insert: Partial<AuditLog> & Pick<AuditLog, "action" | "resource">; Update: Partial<AuditLog>; Relationships: [] };
    };
    Views: Record<string, never>;
    Functions: {
      setup_account: {
        Args: {
          p_account_name: string;
          p_store_name: string;
          p_industry?: StoreIndustry;
          p_display_name?: string | null;
          p_plan?: AccountPlan;
        };
        Returns: SetupAccountResult;
      };
      get_my_context: {
        Args: Record<string, never>;
        Returns: MyContext;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
