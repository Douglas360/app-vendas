export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "admin" | "vendedor";
export type SaleStatus = "aberta" | "finalizada" | "cancelada";
export type PaymentMethod =
  | "dinheiro"
  | "pix"
  | "cartao_debito"
  | "cartao_credito"
  | "fiado";
export type PaymentStatus = "pendente" | "pago" | "parcial" | "cancelado";
export type InstallmentStatus =
  | "pendente"
  | "pago"
  | "atrasado"
  | "cancelado";

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  avatar_url: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  cpf_cnpj: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  credit_limit: number;
  current_debt: number;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductCategory {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  barcode: string | null;
  category_id: string | null;
  cost_price: number;
  sale_price: number;
  stock_quantity: number;
  min_stock: number;
  is_active: boolean;
  image_url: string | null;
  unit: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  category?: ProductCategory;
}

export interface Sale {
  id: string;
  sale_number: number;
  customer_id: string | null;
  seller_id: string;
  subtotal: number;
  discount_amount: number;
  discount_percent: number;
  total: number;
  status: SaleStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  finalized_at: string | null;
  // Joined fields
  customer?: Customer;
  seller?: Profile;
  items?: SaleItem[];
  payments?: Payment[];
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  cost_price: number;
  discount_amount: number;
  total: number;
  created_at: string;
  // Joined fields
  product?: Product;
}

export interface Payment {
  id: string;
  sale_id: string;
  customer_id: string | null;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  installments: number;
  notes: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreditInstallment {
  id: string;
  payment_id: string;
  customer_id: string;
  sale_id: string;
  installment_number: number;
  amount: number;
  amount_paid: number;
  due_date: string;
  paid_date: string | null;
  status: InstallmentStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  customer?: Customer;
  sale?: Sale;
}

export interface CustomerDebtSummary {
  total_debt: number;
  total_paid: number;
  total_overdue: number;
  installments_pending: number;
  installments_overdue: number;
}
