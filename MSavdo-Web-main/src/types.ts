export interface ProductVariant {
  id?: number;
  product_id?: number;
  color: string;
  size: string;
  price_cny: number;
  price_tjs: number;
  stock: number;
  weight_kg: number;
  variant_sku: string;
  image_url: string;
}

export interface Product {
  id: number;
  title: string;
  description: string;
  original_link?: string; // Только для админки
  category_id: number | null;
  category_name?: string;
  base_sku: string;
  status: 'active' | 'draft';
  delivery_type?: 'stock' | 'order';
  main_image: string;
  images?: string;
  video_url?: string;
  youtube_url?: string;
  created_at?: string;
  views_count?: number;
  specifications?: Array<{ name: string; value: string }> | string;
  variants?: ProductVariant[];
  min_price_tjs?: number;
  max_price_tjs?: number;
}

export interface Category {
  id: number;
  name: string;
  parent_id: number | null;
  subcategories?: Category[];
}

export interface CartItem {
  id: string; // product_id + variant_sku
  product_id: number;
  variant_id?: number;
  base_sku: string;
  variant_sku: string;
  title: string;
  color: string;
  size: string;
  price_tjs: number;
  image: string;
  quantity: number;
  stock: number;
  delivery_type?: 'stock' | 'order';
}

export interface OrderItem {
  id?: number | string;
  product_id?: number;
  variant_id?: number;
  base_sku?: string;
  variant_sku?: string;
  title: string;
  color?: string;
  size?: string;
  price_tjs: number;
  image?: string;
  quantity: number;
  order_id?: number;
}

export interface Order {
  id: number;
  order_number: string;
  customer_name?: string;
  customer_phone?: string;
  customer_address?: string;
  customer_notes?: string;
  total_amount: number;
  total_amount_tjs?: number;
  status: 'new' | 'processing' | 'ordered_china' | 'in_transit' | 'delivered' | 'cancelled';
  delivery_type: string;
  items_json: string;
  items?: OrderItem[];
  created_at: string;
}

export interface AdminUser {
  id: number;
  username: string;
}
