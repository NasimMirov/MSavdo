import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Product, ProductVariant, Category, Order } from '../types';
import { 
  AlertTriangle, 
  Lock, 
  LogOut, 
  ExternalLink, 
  Edit3, 
  Trash2, 
  RefreshCw, 
  Sparkles, 
  Scale, 
  Settings, 
  Layers, 
  ArrowLeft,
  Check,
  Save,
  Plus,
  FileCode,
  DollarSign,
  Truck,
  Clock,
  Video,
  Search,
  Upload,
  Clipboard,
  Image as ImageIcon,
  Sliders,
  Eye,
  CheckCircle2,
  Copy,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  List,
  Filter,
  X,
  Code2,
  Package,
  Phone,
  MessageSquare
} from 'lucide-react';
import { ImportProductModal } from './ImportProductModal';
import { ExportCodeModal } from './ExportCodeModal';
import { apiFetch, apiUrl } from '../api';
import { useI18n } from '../i18n';
import { calculatePriceTjs } from '../utils/pricing';
import { COLOR_IMAGE_SPEC_PREFIX, extractProductColors, isProductColorSpecification } from '../utils/productDescription';

interface TelegramLoginResult {
  id_token?: string;
  error?: string;
}

interface TelegramLoginConfig {
  client_id: number;
  nonce: string;
}

interface VisitAnalytics {
  today: { visits_count: number; unique_visitors_count: number };
  all_time: { visits_count: number; unique_visitors_count: number };
  recent_visits: Array<{ visitor_id: string; device_info: string; visited_at: string }>;
  event_retention_days: number;
}

interface SearchAnalytics {
  total_searches: number;
  unique_queries: number;
  popular_queries: Array<{ query_text: string; searches_count: number; last_searched_at: string }>;
  queries: Array<{ query_text: string; searches_count: number; first_searched_at: string; last_searched_at: string }>;
  has_more: boolean;
}

interface CustomerFeedback {
  id: number;
  product_wish: string;
  suggestion: string;
  created_at: string;
}

declare global {
  interface Window {
    Telegram?: {
      Login?: {
        init: (
          options: { client_id: number; scope: string[]; nonce: string; lang: string },
          callback?: (result: TelegramLoginResult) => void,
        ) => void;
        open: (callback?: (result: TelegramLoginResult) => void) => void;
      };
    };
  }
}

interface AdminPanelProps {
  onBack: () => void;
  onRefreshCatalog: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  onBack,
  onRefreshCatalog,
}) => {
  const { t, language } = useI18n();
  // Авторизация
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isTelegramLoginReady, setIsTelegramLoginReady] = useState(false);
  const [telegramLoginNonce, setTelegramLoginNonce] = useState('');
  const adminFetch = (url: string, options: RequestInit = {}) => apiFetch(url, options);

  // Состояния админки
  const [activeTab, setActiveTab] = useState<'products' | 'orders' | 'visitors' | 'searches' | 'feedback' | 'gemini_ai' | 'settings'>('products');
  const [adminProducts, setAdminProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [productSuggestionInProgress, setProductSuggestionInProgress] = useState<'category' | 'description' | null>(null);
  const [categoryEditorProduct, setCategoryEditorProduct] = useState<any | null>(null);
  const [categoryDraftId, setCategoryDraftId] = useState('');
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const editingColorOptions = useMemo(() => {
    if (!editingProduct) return [];
    const specificationColors = extractProductColors(
      editingProduct.specifications || [],
      editingProduct.description || '',
    );
    const variantColors = (editingProduct.variants || [])
      .map((variant: ProductVariant) => String(variant.color || '').trim())
      .filter((color: string) => color && !/^(?:стандарт|standard|основной цвет)$/i.test(color));
    return Array.from(new Set([...specificationColors, ...variantColors]));
  }, [editingProduct]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Состояния для заказов клиентов (Требование 6)
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('all');
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [visitAnalytics, setVisitAnalytics] = useState<VisitAnalytics | null>(null);
  const [isLoadingVisits, setIsLoadingVisits] = useState(false);
  const [searchAnalytics, setSearchAnalytics] = useState<SearchAnalytics | null>(null);
  const [isLoadingSearches, setIsLoadingSearches] = useState(false);
  const [customerFeedback, setCustomerFeedback] = useState<CustomerFeedback[]>([]);
  const [feedbackHasMore, setFeedbackHasMore] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');

  // Навигатор товаров: поиск, фильтры, сортировка и режим отображения
  const [navSearch, setNavSearch] = useState('');
  const [navCategory, setNavCategory] = useState<string>('all');
  const [navDelivery, setNavDelivery] = useState<'all' | 'stock' | 'order'>('all');
  const [navStatus, setNavStatus] = useState<'all' | 'active' | 'draft'>('all');
  const [navSort, setNavSort] = useState<'newest' | 'title' | 'price_asc' | 'price_desc' | 'variants' | 'popular'>('newest');
  const [navViewMode, setNavViewMode] = useState<'table' | 'cards'>('table');
  const [expandedSpecsId, setExpandedSpecsId] = useState<number | null>(null);

  // Уведомление о буфере обмена / действиях
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);
  const showNotice = (msg: string) => {
    setFeedbackNotice(msg);
    setTimeout(() => setFeedbackNotice(null), 3500);
  };

  // Реф для загрузки файлов
  const fileInputRef = useRef<HTMLInputElement>(null);

  // История изменений редактора товара: Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z)
  const editHistoryRef = useRef<{ past: any[]; future: any[]; committed: any | null; timer: number | null }>({
    past: [],
    future: [],
    committed: null,
    timer: null,
  });
  const editingProductRef = useRef<any | null>(null);

  const flushPendingHistory = () => {
    const h = editHistoryRef.current;
    if (h.timer !== null) {
      window.clearTimeout(h.timer);
      h.timer = null;
    }
    const current = editingProductRef.current;
    if (current && h.committed && current !== h.committed) {
      h.past.push(h.committed);
      if (h.past.length > 60) h.past.shift();
      h.committed = current;
      h.future = [];
    }
  };

  useEffect(() => {
    editingProductRef.current = editingProduct;
    const h = editHistoryRef.current;
    if (!editingProduct) {
      if (h.timer !== null) window.clearTimeout(h.timer);
      resetHistory();
      return;
    }
    if (!h.committed || h.committed.id !== editingProduct.id) {
      resetHistory();
      h.committed = editingProduct;
      return;
    }
    if (editingProduct === h.committed) return;
    if (h.timer !== null) window.clearTimeout(h.timer);
    h.timer = window.setTimeout(() => {
      h.timer = null;
      flushPendingHistory();
    }, 400);

    function resetHistory() {
      h.past = [];
      h.future = [];
      h.committed = null;
      h.timer = null;
    }
  }, [editingProduct]);

  const undoProductEdit = () => {
    flushPendingHistory();
    const h = editHistoryRef.current;
    const previous = h.past.pop();
    if (!previous || !h.committed) {
      return;
    }
    h.future.push(h.committed);
    h.committed = previous;
    setEditingProduct(previous);
  };

  const redoProductEdit = () => {
    flushPendingHistory();
    const h = editHistoryRef.current;
    const next = h.future.pop();
    if (!next || !h.committed) {
      return;
    }
    h.past.push(h.committed);
    h.committed = next;
    setEditingProduct(next);
  };

  const isProductEditorOpen = Boolean(editingProduct);
  useEffect(() => {
    if (!isProductEditorOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.code === 'KeyZ' && !event.shiftKey) {
        event.preventDefault();
        undoProductEdit();
      } else if (event.code === 'KeyY' || (event.code === 'KeyZ' && event.shiftKey)) {
        event.preventDefault();
        redoProductEdit();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isProductEditorOpen]);

  // Настройки ценообразования и логистики
  const [settings, setSettings] = useState({
    whatsapp_phone: '992444431',
    cny_tjs_rate: '1.45',
    delivery_per_kg_tjs: '30',
    somon_district_id: '511',
    somon_category_config: {} as Record<string, { rubric_id: string; attributes_json: string }>,
  });
  const [settingsSaved, setSettingsSaved] = useState(false);
  const hasSomonCategoryConfig = (categoryId: number | null) => {
    if (!categoryId) return false;
    const config = settings.somon_category_config[String(categoryId)];
    if (!config || !/^\d+$/.test(config.rubric_id)) return false;
    try {
      const attributes = JSON.parse(config.attributes_json || '{}');
      return attributes && typeof attributes === 'object' && !Array.isArray(attributes) && Object.keys(attributes).length > 0;
    } catch {
      return false;
    }
  };

  // Gemini AI тестер
  const [geminiTestInput, setGeminiTestInput] = useState('2026新款夏季透气飞织运动鞋男鞋情侣款轻便减震跑步鞋 黑色 41 42 43');
  const [geminiResult, setGeminiResult] = useState<any>(null);
  const [isGeminiTesting, setIsGeminiTesting] = useState(false);

  // Восстановление HttpOnly cookie-сессии
  useEffect(() => {
    let active = true;
    adminFetch('/api/admin/check')
      .then((response) => {
        if (active && response.ok) setIsAuthenticated(true);
      })
      .catch(() => {
        if (active) setIsAuthenticated(false);
      });
    localStorage.removeItem('msavdo_admin_token');
    return () => {
      active = false;
    };
  }, []);

  const completeTelegramLogin = useCallback(async (result: TelegramLoginResult, nonce: string) => {
    if (result.error) {
      setLoginError('Вход через Telegram отменён или не выполнен. Попробуйте ещё раз.');
      return;
    }
    if (!result.id_token) {
      setLoginError('Telegram не вернул подтверждение входа. Попробуйте ещё раз.');
      return;
    }
    if (!nonce) {
      setLoginError('Сессия входа истекла. Обновите страницу и попробуйте снова.');
      return;
    }

    setIsLoggingIn(true);
    setLoginError('');
    try {
      const response = await apiFetch('/api/admin/telegram-auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: result.id_token, nonce }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setIsAuthenticated(true);
      } else {
        setLoginError(data.error || 'Не удалось войти через Telegram');
      }
    } catch (error: any) {
      setLoginError(error.message || 'Ошибка соединения с сервером');
    } finally {
      setIsLoggingIn(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) return;
    let active = true;
    let script: HTMLScriptElement | undefined;

    const initializeTelegramLogin = async () => {
      try {
        const response = await apiFetch('/api/admin/telegram-auth/config', { method: 'POST' });
        const config = await response.json() as TelegramLoginConfig & { error?: string };
        if (!response.ok) throw new Error(config.error || 'Не удалось настроить вход через Telegram');
        if (typeof config.nonce !== 'string' || !config.nonce) {
          throw new Error('Сервер не создал сессию входа. Обновите страницу и попробуйте снова.');
        }
        if (!active) return;
        setTelegramLoginNonce(config.nonce);

        script = document.createElement('script');
        script.src = 'https://oauth.telegram.org/js/telegram-login.js?3';
        script.async = true;
        script.onload = () => {
          if (!active) return;
          const loginSdk = window.Telegram?.Login;
          if (!loginSdk) {
            setLoginError('Не удалось загрузить Telegram Login. Проверьте соединение и обновите страницу.');
            return;
          }
          loginSdk.init({
            client_id: config.client_id,
            scope: ['profile'],
            nonce: config.nonce,
            lang: language === 'tg' ? 'en' : language,
          });
          setIsTelegramLoginReady(true);
        };
        script.onerror = () => {
          if (active) setLoginError('Не удалось загрузить Telegram Login. Проверьте соединение и обновите страницу.');
        };
        document.head.appendChild(script);
      } catch (error: any) {
        if (active) setLoginError(error.message || 'Не удалось настроить вход через Telegram');
      }
    };

    void initializeTelegramLogin();
    return () => {
      active = false;
      script?.remove();
    };
  }, [completeTelegramLogin, isAuthenticated, language]);

  const openTelegramLogin = () => {
    const loginSdk = window.Telegram?.Login;
    if (!loginSdk) {
      setLoginError('Telegram Login ещё загружается. Попробуйте немного позже.');
      return;
    }
    setLoginError('');
    loginSdk.open((result) => {
      void completeTelegramLogin(result, telegramLoginNonce);
    });
  };

  useEffect(() => {
    if (isAuthenticated) loadAdminData();
  }, [isAuthenticated]);

  const handleLogout = () => {
    if (isAuthenticated) {
      adminFetch('/api/admin/logout', {
        method: 'POST',
      }).catch(() => {});
    }
    setIsAuthenticated(false);
    localStorage.removeItem('msavdo_admin_token');
  };

  const loadAdminData = async () => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    try {
      // Загрузка товаров с конфиденциальными полями (CNY, оригинальные ссылки, спецификации)
      const resProd = await adminFetch('/api/admin/products', {
      });
      if (resProd.status === 401) {
        handleLogout();
        return;
      }
      if (resProd.ok && (resProd.headers.get('content-type') || '').includes('application/json')) {
        const prodData = await resProd.json();
        setAdminProducts(prodData.products || []);
      }

      // Настройки
      const resSet = await adminFetch('/api/admin/settings', {
      });
      if (resSet.ok && (resSet.headers.get('content-type') || '').includes('application/json')) {
        const setData = await resSet.json();
        setSettings({
          whatsapp_phone: setData.whatsapp_phone || '992444431',
          cny_tjs_rate: setData.cny_tjs_rate || '1.45',
          delivery_per_kg_tjs: setData.delivery_per_kg_tjs || '30',
          somon_district_id: setData.somon_district_id || '511',
          somon_category_config: setData.somon_category_config || {},
        });
      }

      // Категории
      const resCat = await apiFetch('/api/categories');
      if (resCat.ok && (resCat.headers.get('content-type') || '').includes('application/json')) {
        const catData = await resCat.json();
        setCategories(catData.tree || []);
      }

      // Заказы
      await loadOrders();
    } catch (err) {
      console.error('Ошибка загрузки данных админки:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadOrders = async () => {
    setIsLoadingOrders(true);
    try {
      const res = await adminFetch('/api/admin/orders', {
      });
      if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
        const data = await res.json();
        setOrders(data.orders || []);
      }
    } catch (e) {
      console.warn('Ошибка загрузки заказов:', e);
    } finally {
      setIsLoadingOrders(false);
    }
  };

  const loadFeedback = async (before?: number) => {
    setFeedbackLoading(true);
    setFeedbackError('');
    try {
      const response = await adminFetch(`/api/admin/feedback${before ? `?before=${before}` : ''}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: { feedback: CustomerFeedback[]; has_more: boolean } = await response.json();
      setCustomerFeedback((previous) => before ? [...previous, ...data.feedback] : data.feedback);
      setFeedbackHasMore(data.has_more);
    } catch (error) {
      console.error('[Admin Feedback]', error);
      setFeedbackError('Не удалось загрузить предложения. Попробуйте ещё раз.');
    } finally {
      setFeedbackLoading(false);
    }
  };

  const loadVisitAnalytics = async () => {
    setIsLoadingVisits(true);
    try {
      const response = await adminFetch('/api/admin/visit-analytics');
      if (!response.ok) throw new Error(`Analytics request failed: ${response.status}`);
      setVisitAnalytics(await response.json() as VisitAnalytics);
    } catch (error) {
      console.error('[Admin Visit Analytics Error]', error);
      showNotice('Не удалось загрузить статистику посещений');
    } finally {
      setIsLoadingVisits(false);
    }
  };

  const loadSearchAnalytics = async (append = false) => {
    setIsLoadingSearches(true);
    try {
      const offset = append ? searchAnalytics?.queries.length || 0 : 0;
      const response = await adminFetch(`/api/admin/search-analytics?offset=${offset}`);
      if (!response.ok) throw new Error(`Search analytics request failed: ${response.status}`);
      const data = await response.json() as SearchAnalytics;
      setSearchAnalytics((current) => append && current
        ? { ...data, queries: [...current.queries, ...data.queries] }
        : data);
    } catch (error) {
      console.error('[Admin Search Analytics Error]', error);
      showNotice('Не удалось загрузить статистику поиска');
    } finally {
      setIsLoadingSearches(false);
    }
  };

  const handleUpdateOrderStatus = async (orderId: number, newStatus: string) => {
    try {
      const res = await adminFetch(`/api/admin/orders/${orderId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, status: newStatus as any } : o))
        );
        showNotice(`✓ Статус заказа обновлен на "${newStatus}"`);
      }
    } catch (e) {
      showNotice('Ошибка обновления статуса');
    }
  };

  const openOrderEditor = (order: Order) => {
    setEditingOrder({
      ...order,
      total_amount_tjs: order.total_amount_tjs ?? order.total_amount ?? 0,
      items: (order.items || []).map((item) => ({ ...item })),
    });
  };

  const updateEditingOrderItem = (itemIndex: number, field: keyof NonNullable<Order['items']>[number], value: string | number) => {
    setEditingOrder((current) => {
      if (!current) return current;
      const items = (current.items || []).map((item, index) => (
        index === itemIndex ? { ...item, [field]: value } : item
      ));
      return { ...current, items };
    });
  };

  const saveEditedOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingOrder) return;

    setIsSavingOrder(true);
    try {
      const res = await adminFetch(`/api/admin/orders/${editingOrder.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customer_name: editingOrder.customer_name || '',
          customer_phone: editingOrder.customer_phone || '',
          customer_address: editingOrder.customer_address || '',
          status: editingOrder.status,
          total_amount_tjs: Number(editingOrder.total_amount_tjs ?? editingOrder.total_amount) || 0,
          items: editingOrder.items || [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Не удалось сохранить заказ');

      const savedOrder: Order = {
        ...editingOrder,
        total_amount: Number(editingOrder.total_amount_tjs ?? editingOrder.total_amount) || 0,
        total_amount_tjs: Number(editingOrder.total_amount_tjs ?? editingOrder.total_amount) || 0,
      };
      setOrders((previous) => previous.map((order) => order.id === savedOrder.id ? savedOrder : order));
      setEditingOrder(null);
      showNotice(`✓ Изменения заказа ${savedOrder.order_number} сохранены`);
    } catch (error: any) {
      showNotice(error.message || 'Ошибка сохранения заказа');
    } finally {
      setIsSavingOrder(false);
    }
  };

  const addOrderItem = () => {
    setEditingOrder((current) => {
      if (!current) return current;
      const items = current.items || [];
      return {
        ...current,
        items: [...items, {
          title: '',
          color: '',
          size: '',
          quantity: 1,
          price_tjs: 0,
          variant_sku: '',
        }],
      };
    });
  };

  const removeOrderItem = (itemIndex: number) => {
    setEditingOrder((current) => {
      if (!current) return current;
      return { ...current, items: (current.items || []).filter((_, index) => index !== itemIndex) };
    });
  };

  const handleDeleteOrder = async (orderId: number, orderNum: string) => {
    if (!window.confirm(`Вы уверены, что хотите удалить заказ ${orderNum}?`)) return;
    try {
      const res = await adminFetch(`/api/admin/orders/${orderId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setOrders((prev) => prev.filter((o) => o.id !== orderId));
        showNotice(`✓ Заказ ${orderNum} удален`);
      }
    } catch (e) {
      showNotice('Ошибка удаления заказа');
    }
  };

  const [isRecalculatingPrices, setIsRecalculatingPrices] = useState(false);
  const handleRecalculatePrices = async () => {
    if (!confirm('Пересчитать цены всех товаров? Ранее указанные вручную цены продажи будут заменены расчетными.')) return;
    setIsRecalculatingPrices(true);
    try {
      const res = await adminFetch('/api/admin/recalculate-prices', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        showNotice(`✓ ${data.message || 'Цены пересчитаны'}`);
        loadAdminData();
        onRefreshCatalog();
      } else {
        const data = await res.json().catch(() => ({}));
        showNotice(data.error || 'Не удалось пересчитать цены');
      }
    } catch (e) {
      showNotice('Ошибка пересчета цен');
    } finally {
      setIsRecalculatingPrices(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) return;

    try {
      const res = await adminFetch('/api/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        setSettingsSaved(true);
        setTimeout(() => setSettingsSaved(false), 2500);
      } else {
        const data = await res.json().catch(() => ({}));
        showNotice(data.error || 'Не удалось сохранить настройки');
      }
    } catch (err) {
      console.error('Ошибка сохранения настроек:', err);
    }
  };

  const [newImageUrl, setNewImageUrl] = useState('');
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [dragImageIndex, setDragImageIndex] = useState<number | null>(null);
  const [dragVideoIndex, setDragVideoIndex] = useState<number | null>(null);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [productSaveError, setProductSaveError] = useState('');

  // Открытие модала создания нового товара
  const handleOpenCreateModal = () => {
    setProductSaveError('');
    setNewImageUrl('');
    setEditingProduct({
      id: 0,
      base_sku: 'MS-НОВЫЙ',
      title: '',
      description: '',
      delivery_type: 'order',
      status: 'active',
      category_id: null,
      category_name: 'Категория будет определена автоматически через Gemini',
      main_image: '',
      images: [],
      video_url: '',
      video_urls: [],
      youtube_url: '',
      specifications: [
        { name: 'Материал', value: '100% натуральный хлопок' },
        { name: 'Сезонность', value: 'Всесезонный' },
        { name: 'Страна производства', value: 'Фабричный Китай (Контроль M.Savdo)' },
        { name: 'Комплектация', value: 'Фирменная упаковка, товар' },
      ],
      variants: [
        {
          color: 'Основной цвет',
          size: 'Стандарт',
          price_tjs: 120,
          price_cny: 0,
          stock: 15,
          weight_kg: 0.5,
          image_url: '',
        },
      ],
    });
  };

  // Открытие модала редактирования существующего товара
  const handleOpenEditModal = (p: any) => {
    setProductSaveError('');
    setNewImageUrl('');
    let imgList: string[] = [];
    if (Array.isArray(p.images)) {
      imgList = p.images;
    } else if (typeof p.images === 'string' && p.images.trim()) {
      imgList = p.images.split(',').map((s: string) => s.trim()).filter(Boolean);
    } else if (p.main_image) {
      imgList = [p.main_image];
    }

    const varList = (p.variants || []).map((v: any) => ({
      id: v.id,
      color: v.color || 'Основной цвет',
      size: v.size || 'Стандарт',
      price_tjs: v.price_tjs || 0,
      price_cny: v.price_cny || 0,
      stock: v.stock !== undefined ? v.stock : 10,
      weight_kg: v.weight_kg || 0.5,
      volume_m3: v.volume_m3 || 0,
      variant_sku: v.variant_sku || '',
      image_url: v.image_url || '',
    }));

    if (varList.length === 0) {
      varList.push({
        color: 'Основной цвет',
        size: 'Стандарт',
        price_tjs: 100,
        price_cny: 0,
        stock: 10,
        weight_kg: 0.5,
        volume_m3: 0,
        image_url: '',
      });
    }

    // Парсинг спецификаций товара
    let specList: Array<{ name: string; value: string }> = [];
    if (Array.isArray(p.specifications)) {
      specList = p.specifications;
    } else if (typeof p.specifications === 'string' && p.specifications.trim()) {
      try {
        const parsed = JSON.parse(p.specifications);
        if (Array.isArray(parsed)) specList = parsed;
        else if (typeof parsed === 'object' && parsed !== null) {
          specList = Object.entries(parsed).map(([k, v]) => ({ name: k, value: String(v) }));
        }
      } catch (_) {
        specList = p.specifications.split('\n').map((l: string) => {
          const parts = l.split(/[:：]/);
          return { name: (parts[0] || '').trim(), value: parts.slice(1).join(':').trim() };
        }).filter((s: any) => s.name && s.value);
      }
    }
    if (specList.length === 0) {
      specList = [
        { name: 'Материал', value: 'Высококачественные фабричные материалы' },
        { name: 'Сезонность', value: 'Всесезонный' },
        { name: 'Страна производства', value: 'Фабричный Китай (Контроль M.Savdo)' }
      ];
    }

    setEditingProduct({
      id: p.id,
      base_sku: p.base_sku,
      title: p.title,
      description: p.description || '',
      delivery_type: p.delivery_type || 'order',
      status: p.status || 'active',
      category_id: p.category_id,
      category_name: p.category_name || 'Мужские футболки, майки и поло',
      main_image: p.main_image || imgList[0] || '',
      images: imgList,
      video_url: p.video_url || '',
      video_urls: Array.isArray(p.video_urls)
        ? p.video_urls
        : (p.video_url ? [p.video_url] : []),
      youtube_url: p.youtube_url || p.video_url || '',
      video_first: Boolean(p.video_first),
      default_weight_kg: varList[0]?.weight_kg || 0.5,
      specifications: specList,
      variants: varList,
    });
  };

  // 1. Добавление фото по URL
  const handleAddGalleryImage = () => {
    if (!newImageUrl.trim() || !editingProduct) return;
    const cleanUrl = newImageUrl.trim();
    const curImgs = editingProduct.images || [];
    if (!curImgs.includes(cleanUrl)) {
      const updated = [...curImgs, cleanUrl];
      setEditingProduct({
        ...editingProduct,
        images: updated,
        main_image: editingProduct.main_image || cleanUrl,
      });
    }
    setNewImageUrl('');
    showNotice('Фото по ссылке успешно добавлено!');
  };

  // Keep each image upload below common reverse-proxy request limits.
  const readImageFile = (file: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => {
        const original = String(reader.result || '');
        if (!/^data:image\/(png|jpe?g|webp)/i.test(original)) {
          resolve(original);
          return;
        }
        const img = new Image();
        img.onerror = () => resolve(original);
        img.onload = () => {
          let scale = Math.min(1, 1280 / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(original);
            return;
          }
          for (let attempt = 0; attempt < 12; attempt++) {
            canvas.width = Math.max(1, Math.round(img.width * scale));
            canvas.height = Math.max(1, Math.round(img.height * scale));
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const quality = [0.78, 0.68, 0.58, 0.48][attempt % 4];
            const compressed = canvas.toDataURL('image/jpeg', quality);
            if (compressed.length <= 700 * 1024) {
              resolve(original.length <= 700 * 1024 && original.length < compressed.length ? original : compressed);
              return;
            }
            if (attempt % 4 === 3) scale *= 0.8;
          }
          resolve(original);
        };
        img.src = original;
      };
      reader.readAsDataURL(file);
    });

  // 2. Загрузка фото из файлов на компьютере
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !editingProduct) return;

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      readImageFile(file).then((dataUrl) => {
        if (dataUrl) {
          setEditingProduct((prev: any) => {
            if (!prev) return prev;
            const curImgs = prev.images || [];
            if (!curImgs.includes(dataUrl)) {
              return {
                ...prev,
                images: [...curImgs, dataUrl],
                main_image: prev.main_image || dataUrl,
              };
            }
            return prev;
          });
        }
      });
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
    showNotice('Изображения успешно загружены из файлов!');
  };

  // 3. Вставка фото из буфера обмена (Ctrl+V)
  useEffect(() => {
    if (!editingProduct) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            e.preventDefault();
            readImageFile(blob).then((dataUrl) => {
              if (dataUrl) {
                setEditingProduct((prev: any) => {
                  if (!prev) return prev;
                  const curImgs = prev.images || [];
                  return {
                    ...prev,
                    images: [...curImgs, dataUrl],
                    main_image: prev.main_image || dataUrl,
                  };
                });
                showNotice('📸 Фото из буфера обмена вставлено в галерею!');
              }
            });
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [editingProduct]);

  // Перестановка фото: первое фото всегда главное
  const moveGalleryImage = (from: number, to: number) => {
    if (!editingProduct) return;
    const curImgs = [...(editingProduct.images || [])];
    if (from === to || from < 0 || to < 0 || from >= curImgs.length || to >= curImgs.length) return;
    const [moved] = curImgs.splice(from, 1);
    curImgs.splice(to, 0, moved);
    setEditingProduct({ ...editingProduct, images: curImgs, main_image: curImgs[0] || '' });
  };

  const getEditingVideos = (): string[] => (
    Array.isArray(editingProduct?.video_urls) ? editingProduct.video_urls : []
  );

  const setEditingVideos = (videos: string[]) => {
    if (!editingProduct) return;
    setEditingProduct({
      ...editingProduct,
      video_urls: videos,
      video_url: videos[0] || '',
      youtube_url: videos[0] || '',
      video_first: videos.length > 0 ? editingProduct.video_first : false,
    });
  };

  const moveVideo = (from: number, to: number) => {
    const videos = [...getEditingVideos()];
    if (from === to || to < 0 || to >= videos.length) return;
    const [moved] = videos.splice(from, 1);
    videos.splice(to, 0, moved);
    setEditingVideos(videos);
  };

  // Удаление фото из галереи
  const handleRemoveGalleryImage = (index: number) => {
    if (!editingProduct) return;
    const curImgs = [...(editingProduct.images || [])];
    const removed = curImgs.splice(index, 1)[0];
    let newMain = editingProduct.main_image;
    if (newMain === removed) {
      newMain = curImgs[0] || '';
    }
    setEditingProduct({
      ...editingProduct,
      images: curImgs,
      main_image: newMain,
    });
  };

  // Управление характеристиками (спецификациями)
  const handleAddSpecification = () => {
    if (!editingProduct) return;
    const curSpecs = [...(editingProduct.specifications || [])];
    curSpecs.push({ name: '', value: '' });
    setEditingProduct({ ...editingProduct, specifications: curSpecs });
  };

  const handleUpdateSpecification = (index: number, field: 'name' | 'value', val: string) => {
    if (!editingProduct) return;
    const curSpecs = [...(editingProduct.specifications || [])];
    curSpecs[index] = { ...curSpecs[index], [field]: val };
    setEditingProduct({ ...editingProduct, specifications: curSpecs });
  };

  const handleUpdateColorImage = (color: string, imageUrl: string) => {
    if (!editingProduct) return;
    const specifications = [...(editingProduct.specifications || [])];
    const name = `${COLOR_IMAGE_SPEC_PREFIX}${color}`;
    const existingIndex = specifications.findIndex((spec) => spec.name === name);
    if (imageUrl && existingIndex >= 0) {
      specifications[existingIndex] = { ...specifications[existingIndex], value: imageUrl };
    } else if (imageUrl) {
      specifications.push({ name, value: imageUrl });
    } else if (existingIndex >= 0) {
      specifications.splice(existingIndex, 1);
    }
    setEditingProduct({ ...editingProduct, specifications });
  };

  const handleRemoveColorOption = (color: string) => {
    if (!editingProduct) return;
    const normalize = (value: string) => value
      .replace(/\[[^\]]*\]|【[^】]*】/g, '')
      .trim()
      .toLocaleLowerCase('ru');
    const specifications = (editingProduct.specifications || []).flatMap((spec: { name: string; value: string }) => {
      if (spec.name.toLocaleLowerCase('ru') === `${COLOR_IMAGE_SPEC_PREFIX}${color}`.toLocaleLowerCase('ru')) return [];
      if (!isProductColorSpecification(spec.name)) return [spec];

      const remainingColors = spec.value
        .split(/[,，、;；|\n/]+/)
        .map((value: string) => value.trim())
        .filter((value: string) => value && normalize(value) !== normalize(color));
      return remainingColors.length > 0
        ? [{ ...spec, value: remainingColors.join(', ') }]
        : [];
    });
    const description = String(editingProduct.description || '')
      .split(/\r?\n/)
      .flatMap((line: string) => {
        const match = line.match(/^(\s*(?:[•*-]\s*)?(?:доступные\s+цвета|цвет(?:а)?|colou?r)\s*[:：]\s*)(.+)$/i);
        if (!match) return [line];
        const remainingColors = match[2]
          .split(/[,，、;；|\n/]+/)
          .map((value: string) => value.trim())
          .filter((value: string) => value && normalize(value) !== normalize(color));
        return remainingColors.length > 0 ? [`${match[1]}${remainingColors.join(', ')}`] : [];
      })
      .join('\n');

    const variants = editingProduct.variants || [];
    const remainingVariants = variants.filter(
      (variant: ProductVariant) => normalize(variant.color || '') !== normalize(color),
    );
    const nextVariants = remainingVariants.length > 0
      ? remainingVariants
      : variants.map((variant: ProductVariant) => (
        normalize(variant.color || '') === normalize(color)
          ? { ...variant, color: 'Стандарт', image_url: '' }
          : variant
      ));

    setEditingProduct({ ...editingProduct, description, specifications, variants: nextVariants });
  };

  const handleRemoveSpecification = (index: number) => {
    if (!editingProduct) return;
    const curSpecs = [...(editingProduct.specifications || [])];
    curSpecs.splice(index, 1);
    setEditingProduct({ ...editingProduct, specifications: curSpecs });
  };

  const handleApplySpecsPreset = (presetType: 'shoes' | 'clothes' | 'gadgets' | 'ink') => {
    if (!editingProduct) return;
    let newSpecs: Array<{ name: string; value: string }> = [];

    if (presetType === 'shoes') {
      newSpecs = [
        { name: 'Материал верха', value: 'Дышащая сетка Mesh + полимерные вставки' },
        { name: 'Материал подошвы', value: 'Облегченная амортизирующая EVA' },
        { name: 'Сезонность', value: 'Демисезон / Весна-Лето-Осень' },
        { name: 'Тип застежки', value: 'Шнуровка' },
        { name: 'Стелька', value: 'Анатомическая съемная с поддержкой свода' },
        { name: 'Страна производства', value: 'Фабричный Китай (Контроль M.Savdo)' },
      ];
    } else if (presetType === 'clothes') {
      newSpecs = [
        { name: 'Материал', value: '100% натуральный органический хлопок' },
        { name: 'Плотность ткани', value: '450 г/м² (Heavy Cotton)' },
        { name: 'Фасон / Крой', value: 'Свободный силуэт (Oversize)' },
        { name: 'Сезонность', value: 'Всесезонный / Прохладная погода' },
        { name: 'Уход за вещью', value: 'Стирка до 30°C, бережный отжим' },
        { name: 'Страна производства', value: 'Фабричный Китай' },
      ];
    } else if (presetType === 'gadgets') {
      newSpecs = [
        { name: 'Беспроводная связь', value: 'Bluetooth 5.3 (стабильный сигнал до 15м)' },
        { name: 'Время автономной работы', value: 'До 8 часов (до 32ч с зарядным футляром)' },
        { name: 'Разъем питания', value: 'USB Type-C с быстрой зарядкой' },
        { name: 'Защита от влаги', value: 'Класс IPX5 (защита от пота и брызг)' },
        { name: 'Комплектация', value: 'Устройство, провод Type-C, инструкция' },
      ];
    } else if (presetType === 'ink') {
      newSpecs = [
        { name: 'Совместимость', value: 'Epson L3108 / L3115 / L3118 / L3158 / L3168' },
        { name: 'Тип красителя', value: 'Водорастворимый (Dye) / Пигментный' },
        { name: 'Объем емкости', value: '70 мл / 127 мл' },
        { name: 'Срок годности', value: '36 месяцев в заводской упаковке' },
        { name: 'Цветопередача', value: 'Стойкая к выцветанию, точные полутона' },
      ];
    }

    setEditingProduct({ ...editingProduct, specifications: newSpecs });
    showNotice('Шаблон характеристик успешно применен!');
  };

  // Управление вариантами (цвета и размеры)
  const handleAddVariantRow = () => {
    if (!editingProduct) return;
    const curVars = [...(editingProduct.variants || [])];
    curVars.push({
      color: '',
      size: 'Стандарт',
      price_tjs: 120,
      price_cny: 0,
      stock: 15,
      weight_kg: 0.5,
      volume_m3: 0,
      image_url: editingProduct.main_image || '',
    });
    setEditingProduct({ ...editingProduct, variants: curVars });
  };

  const handleRemoveVariantRow = (index: number) => {
    if (!editingProduct || (editingProduct.variants || []).length <= 1) return;
    const curVars = [...(editingProduct.variants || [])];
    curVars.splice(index, 1);
    setEditingProduct({ ...editingProduct, variants: curVars });
  };

  const handleUpdateVariantField = (index: number, field: string, val: any) => {
    if (!editingProduct) return;
    const curVars = [...(editingProduct.variants || [])];
    curVars[index] = { ...curVars[index], [field]: val };
    setEditingProduct({ ...editingProduct, variants: curVars });
  };

  // Загрузка фото варианта из файла
  const handleVariantFileUpload = async (vIdx: number, file: File) => {
    if (!editingProduct || !file) return;
    const dataUrl = await readImageFile(file);
    if (dataUrl) {
      handleUpdateVariantField(vIdx, 'image_url', dataUrl);
      showNotice('📸 Фото варианта загружено из файла!');
    }
  };

  // Вставка фото варианта из буфера обмена (картинка или ссылка)
  const handlePasteVariantImage = async (vIdx: number) => {
    try {
      if (navigator.clipboard && navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const imageType = item.types.find((t) => t.startsWith('image/'));
          if (imageType) {
            const blob = await item.getType(imageType);
            const dataUrl = await readImageFile(blob);
            if (dataUrl) {
              handleUpdateVariantField(vIdx, 'image_url', dataUrl);
              showNotice('📸 Фото из буфера обмена добавлено в вариант!');
            }
            return;
          }
        }
      }

      const text = await navigator.clipboard.readText();
      if (text && (text.startsWith('http://') || text.startsWith('https://') || text.startsWith('data:image'))) {
        handleUpdateVariantField(vIdx, 'image_url', text.trim());
        showNotice('🔗 Ссылка на фото вставлена в вариант!');
        return;
      }

      showNotice('Буфер обмена не содержит изображение или URL');
    } catch {
      const manualUrl = prompt('Вставьте прямую ссылку на фото варианта:');
      if (manualUrl && manualUrl.trim()) {
        handleUpdateVariantField(vIdx, 'image_url', manualUrl.trim());
      }
    }
  };

  const handleProductSuggestion = async (action: 'category' | 'description') => {
    if (!editingProduct || !editingProduct.title.trim()) {
      setProductSaveError('Сначала укажите название товара');
      return;
    }
    const snapshot = editingProduct;
    setProductSuggestionInProgress(action);
    setProductSaveError('');
    try {
      const response = await adminFetch('/api/admin/product-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          title: snapshot.title,
          description: snapshot.description || '',
          specifications: snapshot.specifications || [],
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Не удалось получить рекомендацию');
      if (action === 'category' && (!Number.isSafeInteger(data.category_id) || typeof data.category_name !== 'string')) {
        throw new Error('Сервер вернул некорректную категорию');
      }
      if (action === 'description' && (typeof data.description !== 'string' || !data.description.trim())) {
        throw new Error('Сервер вернул пустое описание');
      }
      setEditingProduct((current: any) => {
        if (!current || current.id !== snapshot.id || current.title !== snapshot.title ||
          (action === 'description' && (current.description !== snapshot.description || current.specifications !== snapshot.specifications)) ||
          (action === 'category' && current.category_id !== snapshot.category_id)) {
          return current;
        }
        return action === 'category'
          ? { ...current, category_id: data.category_id, category_name: data.category_name }
          : { ...current, description: data.description };
      });
      showNotice('Рекомендация получена. Проверьте её перед сохранением товара.');
    } catch (error) {
      console.error('[Product Suggestion]', error);
      setProductSaveError(error instanceof Error ? error.message : 'Не удалось получить рекомендацию');
    } finally {
      setProductSuggestionInProgress(null);
    }
  };

  // Сохранение товара в базу
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated || !editingProduct) return;
    if (!editingProduct.title.trim()) {
      setProductSaveError('Укажите название товара');
      return;
    }

    setIsSavingProduct(true);
    setProductSaveError('');

    try {
      const payload = {
        title: editingProduct.title.trim(),
        category_id: editingProduct.category_id || null,
        description: editingProduct.description || '',
        delivery_type: editingProduct.delivery_type || 'order',
        status: editingProduct.status || 'active',
        main_image: editingProduct.main_image || (editingProduct.images?.[0] || ''),
        images: editingProduct.images || [],
        video_urls: Array.isArray(editingProduct.video_urls)
          ? editingProduct.video_urls
          : String(editingProduct.video_urls || '').split(/\r?\n/).map((url: string) => url.trim()).filter(Boolean),
        video_url: (Array.isArray(editingProduct.video_urls) ? editingProduct.video_urls[0] : '') || '',
        youtube_url: (Array.isArray(editingProduct.video_urls) ? editingProduct.video_urls[0] : '') || '',
        video_first: Boolean(editingProduct.video_first),
        default_weight_kg: editingProduct.default_weight_kg || 0.5,
        specifications: (editingProduct.specifications || []).filter((s: any) => s.name.trim() && s.value.trim()),
        variants: editingProduct.variants || [],
      };
      const uploadedImages = new Map<string, Promise<string>>();
      const toStoredImage = (image: string): Promise<string> => {
        if (!image.startsWith('data:image/')) return Promise.resolve(image);
        let uploaded = uploadedImages.get(image);
        if (!uploaded) {
          uploaded = (async () => {
            let imageToUpload = image;
            if (imageToUpload.length > 700 * 1024) {
              const blob = await fetch(imageToUpload).then((response) => response.blob());
              imageToUpload = await readImageFile(blob);
            }
            if (imageToUpload.length > 700 * 1024) {
              throw new Error('Не удалось уменьшить размер фото. Загрузите изображение меньшего размера или добавьте его по ссылке.');
            }

            const response = await adminFetch('/api/admin/upload-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ image: imageToUpload }),
            });
            if (response.status === 413) {
              throw new Error('Фото слишком большое для загрузки даже после сжатия. Добавьте его по ссылке или выберите другое изображение.');
            }
            const result = await response.json();
            if (!response.ok || typeof result.url !== 'string') {
              throw new Error(result.error || `Не удалось загрузить фото (ошибка ${response.status})`);
            }
            return result.url;
          })();
          uploadedImages.set(image, uploaded);
        }
        return uploaded;
      };
      const storedImages = await Promise.all(payload.images.map(toStoredImage));
      const storedMainImage = await toStoredImage(payload.main_image);
      const storedVariants = await Promise.all(payload.variants.map(async (variant: any) => ({
        ...variant,
        image_url: typeof variant.image_url === 'string'
          ? await toStoredImage(variant.image_url)
          : variant.image_url,
      })));
      payload.images = storedImages;
      payload.main_image = storedMainImage;
      payload.variants = storedVariants;
      const requestBody = JSON.stringify(payload);

      const url = editingProduct.id === 0 ? '/api/admin/products' : `/api/admin/products/${editingProduct.id}`;
      const method = editingProduct.id === 0 ? 'POST' : 'PUT';

      const res = await adminFetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: requestBody,
      });

      const raw = await res.text();
      let data: any = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = {};
      }
      if (!res.ok) {
        if (res.status === 413) {
          throw new Error('Слишком большой запрос. Удалите часть текста или ссылок в описании товара и повторите сохранение.');
        }
        throw new Error(data.error || `Сервер вернул ошибку ${res.status}. Повторите попытку`);
      }

      setEditingProduct(null);
      await loadAdminData();
      onRefreshCatalog();
      showNotice(editingProduct.id === 0 ? '✓ Новый товар успешно создан!' : '✓ Товар и характеристики обновлены!');
    } catch (err: any) {
      console.error('Ошибка сохранения товара:', err);
      setProductSaveError(err.message || 'Ошибка сети');
    } finally {
      setIsSavingProduct(false);
    }
  };

  const openCategoryEditor = (product: any) => {
    setCategoryEditorProduct(product);
    setCategoryDraftId(product.category_id ? String(product.category_id) : '');
  };

  const handleSaveProductCategory = async () => {
    if (!categoryEditorProduct || !categoryDraftId) return;
    setIsSavingCategory(true);
    try {
      const response = await adminFetch(`/api/admin/products/${categoryEditorProduct.id}/category`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_id: Number(categoryDraftId) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Не удалось изменить категорию');
      setAdminProducts((previous) => previous.map((product) => (
        product.id === categoryEditorProduct.id
          ? { ...product, category_id: data.category_id, category_name: data.category_name }
          : product
      )));
      setCategoryEditorProduct(null);
      onRefreshCatalog();
      showNotice(`Категория товара обновлена: ${data.category_name}`);
    } catch (error: any) {
      console.error('Ошибка смены категории товара:', error);
      showNotice(error.message || 'Не удалось изменить категорию товара');
    } finally {
      setIsSavingCategory(false);
    }
  };

  // Удаление товара
  const handleDeleteProduct = async (id: number) => {
    if (!isAuthenticated || !confirm('Удалить этот товар, все его характеристики и модификации из базы?')) return;
    try {
      const res = await adminFetch(`/api/admin/products/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        loadAdminData();
        onRefreshCatalog();
        showNotice('Товар удален из каталога');
      }
    } catch (err) {
      console.error('Ошибка удаления:', err);
    }
  };

  // Быстрое переключение статуса (active / draft) прямо из списка
  const handleQuickToggleStatus = async (p: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAuthenticated) return;
    const newStatus = p.status === 'active' ? 'draft' : 'active';
    try {
      const res = await adminFetch(`/api/admin/products/${p.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...p,
          status: newStatus,
        }),
      });
      if (res.ok) {
        setAdminProducts((prev) =>
          prev.map((item) => (item.id === p.id ? { ...item, status: newStatus } : item))
        );
        onRefreshCatalog();
        showNotice(`Статус товара ${p.base_sku}: ${newStatus === 'active' ? 'Активен на витрине' : 'Перенесен в черновики'}`);
      } else {
        const data = await res.json();
        showNotice(data.error || 'Не удалось изменить статус товара');
      }
    } catch (err) {
      console.error('Ошибка смены статуса:', err);
    }
  };

  // Быстрое переключение типа доставки (В наличии / Под заказ)
  const handleQuickToggleDelivery = async (p: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAuthenticated) return;
    const newDelivery = p.delivery_type === 'stock' ? 'order' : 'stock';
    try {
      const res = await adminFetch(`/api/admin/products/${p.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...p,
          delivery_type: newDelivery,
        }),
      });
      if (res.ok) {
        setAdminProducts((prev) =>
          prev.map((item) => (item.id === p.id ? { ...item, delivery_type: newDelivery } : item))
        );
        onRefreshCatalog();
        showNotice(`Доставка для ${p.base_sku}: ${newDelivery === 'stock' ? 'В наличии' : 'Доставка 12–35 дней'}`);
      }
    } catch (err) {
      console.error('Ошибка смены доставки:', err);
    }
  };

  // Копирование артикула SKU
  const handleCopySku = (sku: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(sku).then(() => {
      showNotice(`Артикул ${sku} скопирован в буфер!`);
    });
  };

  // Тестирование Gemini
  const handleTestGemini = async () => {
    if (!isAuthenticated || !geminiTestInput.trim()) return;
    setIsGeminiTesting(true);
    setGeminiResult(null);

    try {
      const res = await adminFetch('/api/admin/test-gemini', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: geminiTestInput }),
      });
      const data = await res.json();
      setGeminiResult(data.result);
    } catch (err: any) {
      setGeminiResult({ error: err.message });
    } finally {
      setIsGeminiTesting(false);
    }
  };

  // ==========================================
  // ФИЛЬТРАЦИЯ И СОРТИРОВКА В НАВИГАТОРЕ ТОВАРОВ
  // ==========================================
  const filteredAdminProducts = useMemo(() => {
    return adminProducts
      .filter((p) => {
        // Поиск по ключевому слову
        if (navSearch.trim()) {
          const q = navSearch.toLowerCase().trim();
          const titleMatch = (p.title || '').toLowerCase().includes(q);
          const skuMatch = (p.base_sku || '').toLowerCase().includes(q);
          const descMatch = (p.description || '').toLowerCase().includes(q);
          const specsMatch = (p.specifications || []).some(
            (s: any) => (s.name || '').toLowerCase().includes(q) || (s.value || '').toLowerCase().includes(q)
          );
          const variantMatch = (p.variants || []).some(
            (v: any) => (v.color || '').toLowerCase().includes(q) || (v.variant_sku || '').toLowerCase().includes(q)
          );

          if (!titleMatch && !skuMatch && !descMatch && !specsMatch && !variantMatch) {
            return false;
          }
        }

        // Фильтр по категории
        if (navCategory !== 'all') {
          if (p.category_name !== navCategory) return false;
        }

        // Фильтр по доставке
        if (navDelivery === 'stock' && p.delivery_type !== 'stock') return false;
        if (navDelivery === 'order' && p.delivery_type === 'stock') return false;

        // Фильтр по статусу
        if (navStatus === 'active' && p.status !== 'active') return false;
        if (navStatus === 'draft' && p.status !== 'draft') return false;

        return true;
      })
      .sort((a, b) => {
        if (navSort === 'newest') return b.id - a.id;
        if (navSort === 'title') return a.title.localeCompare(b.title);
        if (navSort === 'variants') return (b.variants?.length || 0) - (a.variants?.length || 0);
        if (navSort === 'popular') return (b.views_count || 0) - (a.views_count || 0);

        const aPrices = (a.variants || []).map((v: any) => v.price_tjs).filter((pr: number) => pr > 0);
        const bPrices = (b.variants || []).map((v: any) => v.price_tjs).filter((pr: number) => pr > 0);
        const aMin = aPrices.length > 0 ? Math.min(...aPrices) : 0;
        const bMin = bPrices.length > 0 ? Math.min(...bPrices) : 0;

        if (navSort === 'price_asc') return aMin - bMin;
        if (navSort === 'price_desc') return bMin - aMin;
        return 0;
      });
  }, [adminProducts, navSearch, navCategory, navDelivery, navStatus, navSort]);

  // Список уникальных категорий из имеющихся товаров
  const availableCategoryNames = useMemo(() => {
    const set = new Set<string>();
    adminProducts.forEach((p) => {
      if (p.category_name) set.add(p.category_name);
    });
    return Array.from(set);
  }, [adminProducts]);

  // ==========================================
  // ЭКРАН ВХОДА (ЕСЛИ НЕ АВТОРИЗОВАН)
  // ==========================================
  if (!isAuthenticated) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-md items-center justify-center px-4">
        <div className="w-full space-y-4">
          {loginError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700 text-center">
              {loginError}
            </div>
          )}
          <button
            type="button"
            onClick={openTelegramLogin}
            disabled={isLoggingIn || !isTelegramLoginReady}
            className="w-full rounded-xl bg-[#229ed9] py-4 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#168ac2] disabled:opacity-50"
          >
            {isLoggingIn ? t('telegramChecking') : isTelegramLoginReady ? t('telegramLogin') : t('telegramLoading')}
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // ЭКРАН АДМИНИСТРАТОРА
  // ==========================================
  return (
    <div className="max-w-7xl mx-auto py-2 space-y-3">
      
      {/* Toast Notification */}
      {feedbackNotice && (
        <div className="fixed top-5 right-5 z-50 bg-black text-amber-400 border border-amber-400/40 rounded-2xl px-4 py-3 text-xs font-bold shadow-2xl flex items-center gap-2 animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{feedbackNotice}</span>
        </div>
      )}

      {/* Верхняя шапка */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 text-slate-500 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            title={t('adminBack')}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          
          <img 
            src="/assets/aistudio/photo_2026-06-11_22-16-50_6464a600.jpg" 
            alt="M.Savdo" 
            className="w-10 h-10 rounded-xl object-cover border-2 border-amber-400 shadow-xs"
          />
          <div>
            <h1 className="text-base font-extrabold text-slate-900 font-heading">MSAVDO</h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsExportModalOpen(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-black hover:bg-zinc-800 text-amber-400 font-bold text-[11px] rounded-lg transition-colors border border-amber-400/40"
            title="Получить готовые файлы Chrome-расширения"
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>{t('chromeExtension')}</span>
          </button>

          <button
            onClick={() => setIsImportModalOpen(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-amber-400 hover:bg-amber-300 text-black font-black text-[11px] rounded-lg transition-all"
            title="Вставить исходный HTML-код страницы или window.context для строгого ИИ-анализа"
          >
            <Code2 className="w-4 h-4" />
            <span>⚡ {t('pastePageCode')}</span>
          </button>

          <button
            onClick={loadAdminData}
            className="p-1.5 text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            title="Обновить данные"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 font-semibold text-[11px] rounded-lg transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{t('logout')}</span>
          </button>
        </div>
      </div>

      {/* Вкладки админки */}
      <div className="flex items-center gap-1.5 border-b border-slate-200 pb-1.5 overflow-x-auto text-[11px] font-bold">
        <button
          onClick={() => setActiveTab('products')}
          className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 ${
            activeTab === 'products'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Layers className="w-4 h-4 text-emerald-400" />
          <span>{t('adminCatalog')} ({adminProducts.length})</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('orders');
            loadOrders();
          }}
          className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 relative ${
            activeTab === 'orders'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Package className="w-4 h-4 text-amber-400" />
          <span>{t('adminOrders')}</span>
          {orders.length > 0 && (
            <span className="bg-amber-400 text-black text-[10px] font-black px-2 py-0.5 rounded-full ml-1">
              {orders.length}
            </span>
          )}
        </button>

        <button
          onClick={() => {
            setActiveTab('visitors');
            void loadVisitAnalytics();
          }}
          className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 ${
            activeTab === 'visitors'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Eye className="w-4 h-4 text-sky-500" />
          <span>Посещения</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('searches');
            void loadSearchAnalytics();
          }}
          className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 ${
            activeTab === 'searches'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Search className="w-4 h-4 text-amber-500" />
          <span>Поиски</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('feedback');
            void loadFeedback();
          }}
          className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 ${
            activeTab === 'feedback'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <MessageSquare className="w-4 h-4 text-emerald-500" />
          <span>Предложения</span>
        </button>

        <button
          onClick={() => setActiveTab('gemini_ai')}
          className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 ${
            activeTab === 'gemini_ai'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span>{t('adminAi')}</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 ${
            activeTab === 'settings'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Settings className="w-4 h-4 text-blue-400" />
          <span>{t('adminSettings')}</span>
        </button>
      </div>

      {/* ========================================== */}
      {/* ВКЛАДКА 1: НАВИГАТОР ТОВАРОВ И КАТАЛОГА */}
      {/* ========================================== */}
      {activeTab === 'feedback' && (
        <section className="space-y-3 py-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-slate-900">Пожелания клиентов</h2>
            <button type="button" disabled={feedbackLoading} onClick={() => void loadFeedback()}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold disabled:opacity-50">
              Обновить
            </button>
          </div>
          {feedbackError && <p role="alert" className="text-sm text-red-700">{feedbackError}</p>}
          {feedbackLoading && customerFeedback.length === 0 && <p className="text-sm text-slate-500">Загрузка…</p>}
          {!feedbackLoading && !feedbackError && customerFeedback.length === 0 && (
            <p className="text-sm text-slate-500">Предложений пока нет.</p>
          )}
          {customerFeedback.map((item) => (
            <article key={item.id} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
              <time dateTime={item.created_at} className="block text-xs text-slate-500">
                {new Date(item.created_at).toLocaleString('ru-RU', { timeZone: 'Asia/Dushanbe' })}
              </time>
              {item.product_wish && <div><h3 className="text-xs font-bold text-slate-700">Желаемые товары</h3>
                <p className="whitespace-pre-wrap break-words text-sm text-slate-900">{item.product_wish}</p></div>}
              {item.suggestion && <div><h3 className="text-xs font-bold text-slate-700">Улучшение сервиса</h3>
                <p className="whitespace-pre-wrap break-words text-sm text-slate-900">{item.suggestion}</p></div>}
            </article>
          ))}
          {feedbackHasMore && <button type="button" disabled={feedbackLoading}
            onClick={() => void loadFeedback(customerFeedback[customerFeedback.length - 1]?.id)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold disabled:opacity-50">
            {feedbackLoading ? 'Загрузка…' : 'Показать ещё'}
          </button>}
        </section>
      )}
      {activeTab === 'products' && (
        <div className="space-y-4">
          
          {/* Сводные KPI метрики каталога */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[11px] text-slate-500 font-medium block">Всего товаров:</span>
              <span className="text-xl font-extrabold text-slate-900 font-mono mt-0.5 block">{adminProducts.length}</span>
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-emerald-200 bg-emerald-50/30 shadow-xs">
              <span className="text-[11px] text-emerald-700 font-medium block flex items-center gap-1">
                <Truck className="w-3 h-3" />
                <span>В наличии (Душанбе):</span>
              </span>
              <span className="text-xl font-extrabold text-emerald-900 font-mono mt-0.5 block">
                {adminProducts.filter(p => p.delivery_type === 'stock').length}
              </span>
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-amber-200 bg-amber-50/30 shadow-xs">
              <span className="text-[11px] text-amber-700 font-medium block flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>Доставка 12–35 дней:</span>
              </span>
              <span className="text-xl font-extrabold text-amber-900 font-mono mt-0.5 block">
                {adminProducts.filter(p => p.delivery_type !== 'stock').length}
              </span>
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[11px] text-slate-500 font-medium block">Черновики (скрытые):</span>
              <span className="text-xl font-extrabold text-slate-600 font-mono mt-0.5 block">
                {adminProducts.filter(p => p.status === 'draft').length}
              </span>
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs col-span-2 sm:col-span-1">
              <span className="text-[11px] text-slate-500 font-medium block">Всего SKU опций:</span>
              <span className="text-xl font-extrabold text-purple-700 font-mono mt-0.5 block">
                {adminProducts.reduce((sum, p) => sum + (p.variants?.length || 0), 0)}
              </span>
            </div>
          </div>

          {/* ИНТЕРАКТИВНЫЙ НАВИГАТОР: ПОИСК, КАТАЛОГ И ФИЛЬТРЫ */}
          <div className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-5 shadow-xs space-y-4">
            
            {/* Строка поиска и действия */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-xl">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  value={navSearch}
                  onChange={(e) => setNavSearch(e.target.value)}
                  placeholder="Быстрый поиск по названию, артикулу MS-..., цвету, характеристикам..."
                  className="w-full pl-10 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 transition-all"
                />
                {navSearch && (
                  <button
                    onClick={() => setNavSearch('')}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setIsImportModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-amber-400 hover:bg-amber-300 text-black rounded-xl font-black text-xs transition-colors shadow-xs"
                  title="Вставить HTML-код страницы или window.context"
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>Вставить код страницы</span>
                </button>

                <button
                  onClick={handleOpenCreateModal}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition-colors shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Создать вручную</span>
                </button>

                {/* Переключатель вида */}
                <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                  <button
                    onClick={() => setNavViewMode('table')}
                    className={`p-1.5 rounded-lg transition-colors ${
                      navViewMode === 'table' ? 'bg-white text-black shadow-xs font-bold' : 'text-slate-500 hover:text-slate-800'
                    }`}
                    title="Табличный вид"
                  >
                    <List className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setNavViewMode('cards')}
                    className={`p-1.5 rounded-lg transition-colors ${
                      navViewMode === 'cards' ? 'bg-white text-black shadow-xs font-bold' : 'text-slate-500 hover:text-slate-800'
                    }`}
                    title="Карточный вид"
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Каталог категорий (Навигатор) */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 shrink-0">
                Каталог:
              </span>
              <button
                onClick={() => setNavCategory('all')}
                className={`px-3 py-1.5 rounded-xl transition-all shrink-0 font-bold ${
                  navCategory === 'all'
                    ? 'bg-black text-amber-400 shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Все категории ({adminProducts.length})
              </button>
              {availableCategoryNames.map((catName) => {
                const count = adminProducts.filter((p) => p.category_name === catName).length;
                const isSelected = navCategory === catName;
                return (
                  <button
                    key={catName}
                    onClick={() => setNavCategory(catName)}
                    className={`px-3 py-1.5 rounded-xl transition-all shrink-0 font-semibold ${
                      isSelected
                        ? 'bg-black text-amber-400 shadow-xs font-bold'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {catName} ({count})
                  </button>
                );
              })}
            </div>

            {/* Фильтры и сортировка */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                {/* Фильтр доставки */}
                <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200">
                  <button
                    onClick={() => setNavDelivery('all')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                      navDelivery === 'all' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-500'
                    }`}
                  >
                    Все типы
                  </button>
                  <button
                    onClick={() => setNavDelivery('stock')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-colors flex items-center gap-1 ${
                      navDelivery === 'stock' ? 'bg-emerald-600 text-white shadow-xs font-bold' : 'text-slate-600'
                    }`}
                  >
                    <span>В наличии</span>
                  </button>
                  <button
                    onClick={() => setNavDelivery('order')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-colors flex items-center gap-1 ${
                      navDelivery === 'order' ? 'bg-amber-400 text-black shadow-xs font-bold' : 'text-slate-600'
                    }`}
                  >
                    <span>Под заказ</span>
                  </button>
                </div>

                {/* Фильтр статуса */}
                <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200">
                  <button
                    onClick={() => setNavStatus('all')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                      navStatus === 'all' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-500'
                    }`}
                  >
                    {t('allStatuses')}
                  </button>
                  <button
                    onClick={() => setNavStatus('active')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                      navStatus === 'active' ? 'bg-emerald-100 text-emerald-800 font-bold' : 'text-slate-600'
                    }`}
                  >
                    {t('active')}
                  </button>
                  <button
                    onClick={() => setNavStatus('draft')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                      navStatus === 'draft' ? 'bg-amber-100 text-amber-800 font-bold' : 'text-slate-600'
                    }`}
                  >
                    {t('drafts')}
                  </button>
                </div>
              </div>

              {/* Сортировка */}
              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-medium">{t('sortBy')}</span>
                <select
                  value={navSort}
                  onChange={(e: any) => setNavSort(e.target.value)}
                  className="p-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none"
                >
                  <option value="newest">{t('newestAdmin')}</option>
                  <option value="title">{t('titleAscending')}</option>
                  <option value="price_asc">{t('priceAscending')}</option>
                  <option value="price_desc">{t('priceDescending')}</option>
                  <option value="variants">{t('variantCount')}</option>
                  <option value="popular">{t('adminPopularity')}</option>
                </select>
              </div>
            </div>

          </div>

          {/* СПИСОК ТОВАРОВ В НАВИГАТОРЕ */}
          {filteredAdminProducts.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center space-y-3 shadow-xs">
              <Search className="w-10 h-10 text-slate-300 mx-auto" />
              <h3 className="text-base font-bold text-slate-900">Товары не найдены</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Попробуйте изменить поисковый запрос, сбросить фильтры категорий или создать новый товар.
              </p>
              <button
                onClick={() => {
                  setNavSearch('');
                  setNavCategory('all');
                  setNavDelivery('all');
                  setNavStatus('all');
                }}
                className="px-4 py-2 bg-black text-amber-400 rounded-xl text-xs font-bold"
              >
                Сбросить все фильтры
              </button>
            </div>
          ) : navViewMode === 'table' ? (
            /* ======================================================== */
            /* РЕЖИМ 1: ТАБЛИЧНЫЙ НАВИГАТОР */
            /* ======================================================== */
            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600 divide-y divide-slate-100">
                  <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3.5">Фото</th>
                      <th className="p-3.5">Артикул SKU</th>
                      <th className="p-3.5">Название и Категория</th>
                      <th className="p-3.5">Доставка</th>
                      <th className="p-3.5">Статус</th>
                      <th className="p-3.5">Варианты и цены</th>
                      <th className="p-3.5">Характеристики</th>
                      <th className="p-3.5 text-right">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAdminProducts.map((p) => {
                      const variants = p.variants || [];
                      const prices = variants.map((v: any) => v.price_tjs).filter((pr: number) => pr > 0);
                      const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
                      const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
                      const specs = p.specifications || [];
                      const isSpecsOpen = expandedSpecsId === p.id;

                      return (
                        <React.Fragment key={p.id}>
                          <tr className="hover:bg-slate-50/70 transition-colors">
                            {/* Фото */}
                            <td className="p-3.5">
                              <img
                                src={p.main_image || 'https://placehold.co/100x100?text=M.Savdo'}
                                alt=""
                                referrerPolicy="no-referrer"
                                className="w-12 h-14 rounded-xl object-cover border border-slate-200 shrink-0"
                              />
                            </td>

                            {/* Артикул */}
                            <td className="p-3.5 font-mono text-xs font-bold text-slate-900 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span>{p.base_sku}</span>
                                <button
                                  onClick={(e) => handleCopySku(p.base_sku, e)}
                                  className="text-slate-400 hover:text-slate-700 p-1 rounded"
                                  title="Скопировать артикул"
                                >
                                  <Copy className="w-3 h-3" />
                                </button>
                              </div>
                            </td>

                            {/* Название и категория */}
                            <td className="p-3.5 max-w-xs">
                              <div className="font-bold text-slate-900 leading-snug line-clamp-2">
                                {p.title}
                              </div>
                              <div className="text-[11px] text-amber-700 font-semibold mt-0.5">
                                {p.category_name || 'Без категории'}
                              </div>
                              <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-slate-500" title="Просмотры товара">
                                <Eye className="h-3 w-3" />
                                <span>{p.views_count || 0}</span>
                              </div>
                              {p.original_link && (
                                <a
                                  href={p.original_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[10px] text-emerald-700 hover:underline mt-1"
                                >
                                  <span>Ссылка на фабрику</span>
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              )}
                            </td>

                            {/* Тип доставки с переключателем в 1 клик */}
                            <td className="p-3.5 whitespace-nowrap">
                              <button
                                onClick={(e) => handleQuickToggleDelivery(p, e)}
                                className={`px-2.5 py-1 rounded-xl text-[10px] font-bold transition-all border flex items-center gap-1 shadow-xs ${
                                  p.delivery_type === 'stock'
                                    ? 'bg-emerald-600 text-white border-emerald-500 hover:bg-emerald-700'
                                    : 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                                }`}
                                title="Нажмите для переключения доставки"
                              >
                                {p.delivery_type === 'stock' ? (
                                  <>
                                    <Truck className="w-3 h-3" />
                                    <span>В наличии (1 дн)</span>
                                  </>
                                ) : (
                                  <>
                                    <Clock className="w-3 h-3 text-amber-700" />
                                    <span>Доставка 12–35 дней</span>
                                  </>
                                )}
                              </button>
                            </td>

                            {/* Статус с переключателем в 1 клик */}
                            <td className="p-3.5 whitespace-nowrap">
                              <button
                                onClick={(e) => handleQuickToggleStatus(p, e)}
                                className={`px-2.5 py-1 rounded-xl text-[10px] font-bold transition-all border ${
                                  p.status === 'active'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                                    : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                                }`}
                                title="Нажмите для смены статуса (активен/черновик)"
                              >
                                {p.status === 'active' ? '🟢 active' : '🟡 draft'}
                              </button>
                            </td>

                            {/* Цены и варианты */}
                            <td className="p-3.5 whitespace-nowrap">
                              <div className="font-extrabold text-slate-900 font-mono text-sm">
                                {minPrice === maxPrice || maxPrice === 0 ? `${minPrice} TJS` : `${minPrice} - ${maxPrice} TJS`}
                              </div>
                              <div className="text-[10px] text-slate-400 font-medium">
                                {variants.length} модификаций SKU
                              </div>
                            </td>

                            {/* Характеристики (кнопка раскрытия) */}
                            <td className="p-3.5">
                              <button
                                onClick={() => setExpandedSpecsId(isSpecsOpen ? null : p.id)}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold transition-colors"
                              >
                                <Sliders className="w-3 h-3 text-emerald-600" />
                                <span>{specs.length} свойств</span>
                                {isSpecsOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </button>
                            </td>

                            {/* Действия */}
                            <td className="p-3.5 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  onClick={() => openCategoryEditor(p)}
                                  className="p-1.5 rounded-lg text-slate-600 transition-colors hover:bg-amber-50 hover:text-amber-700"
                                  title="Изменить категорию товара"
                                  aria-label={`Изменить категорию товара ${p.title}`}
                                >
                                  <Layers className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => handleOpenEditModal(p)}
                                  className="p-1.5 bg-slate-900 hover:bg-emerald-700 text-white rounded-lg transition-colors shadow-xs"
                                  title="Редактировать товар"
                                >
                                  <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                                </button>
                                <button
                                  onClick={() => handleDeleteProduct(p.id)}
                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Удалить товар"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Раскрывающийся блок характеристик */}
                          {isSpecsOpen && (
                            <tr className="bg-slate-50/90">
                              <td colSpan={8} className="p-4 border-y border-slate-200">
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                                    <span className="flex items-center gap-1.5">
                                      <Sliders className="w-3.5 h-3.5 text-emerald-600" />
                                      <span>Все характеристики товара {p.base_sku}:</span>
                                    </span>
                                    <button
                                      onClick={() => handleOpenEditModal(p)}
                                      className="text-amber-700 hover:underline text-[11px]"
                                    >
                                      Изменить характеристики в редакторе
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-[11px]">
                                    {specs.map((s: any, idx: number) => (
                                      <div key={idx} className="bg-white p-2 rounded-xl border border-slate-200">
                                        <div className="text-slate-400 text-[10px] font-medium">{s.name}</div>
                                        <div className="text-slate-900 font-bold truncate mt-0.5">{s.value}</div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* ======================================================== */
            /* РЕЖИМ 2: СЕТКА КАРТОЧЕК */
            /* ======================================================== */
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {filteredAdminProducts.map((p) => {
                const variants = p.variants || [];
                const prices = variants.map((v: any) => v.price_tjs).filter((pr: number) => pr > 0);
                const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
                const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
                const specs = p.specifications || [];

                return (
                  <div
                    key={p.id}
                    className="bg-white border border-slate-200 hover:border-amber-400 rounded-3xl p-4 transition-all shadow-xs hover:shadow-md flex flex-col justify-between space-y-3"
                  >
                    <div>
                      {/* Верхняя строка карточки */}
                      <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-100 mb-3 border border-slate-200">
                        <img
                          src={p.main_image || 'https://placehold.co/300x200?text=M.Savdo'}
                          alt={p.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute top-2 left-2 bg-black/85 text-amber-400 font-mono text-[10px] font-bold px-2 py-0.5 rounded shadow-xs">
                          {p.base_sku}
                        </div>
                        <div className="absolute top-2 right-2 flex items-center gap-1">
                          <button
                            onClick={(e) => handleQuickToggleStatus(p, e)}
                            className={`px-2 py-0.5 rounded-full text-[9px] font-bold shadow-xs ${
                              p.status === 'active' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {p.status}
                          </button>
                        </div>
                        <div className="absolute bottom-2 left-2">
                          <button
                            onClick={(e) => handleQuickToggleDelivery(p, e)}
                            className={`px-2 py-0.5 rounded-md text-[9px] font-bold shadow-xs ${
                              p.delivery_type === 'stock' ? 'bg-emerald-600 text-white' : 'bg-amber-400 text-black'
                            }`}
                          >
                            {p.delivery_type === 'stock' ? 'В наличии' : 'Доставка 12–35 дней'}
                          </button>
                        </div>
                      </div>

                      <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-1">
                        {p.category_name}
                      </div>
                      <div className="mb-1 inline-flex items-center gap-1 text-[10px] font-medium text-slate-500" title="Просмотры товара">
                        <Eye className="h-3 w-3" />
                        <span>{p.views_count || 0}</span>
                      </div>
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 leading-snug line-clamp-2">
                        {p.title}
                      </h4>

                      {/* Характеристики превью */}
                      {specs.length > 0 && (
                        <div className="mt-2.5 p-2 bg-slate-50 rounded-xl border border-slate-100 space-y-1 text-[10px]">
                          <div className="font-bold text-slate-500 uppercase tracking-wider text-[9px] flex items-center gap-1">
                            <Sliders className="w-2.5 h-2.5 text-emerald-600" />
                            <span>Характеристики ({specs.length}):</span>
                          </div>
                          <div className="grid grid-cols-2 gap-1 text-slate-700">
                            {specs.slice(0, 4).map((s: any, idx: number) => (
                              <div key={idx} className="truncate">
                                <span className="text-slate-400">{s.name}: </span>
                                <span className="font-semibold">{s.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                      <div>
                        <div className="text-[10px] text-slate-400">Розничная цена:</div>
                        <div className="text-sm font-black text-slate-900 font-mono">
                          {minPrice === maxPrice || maxPrice === 0 ? `${minPrice} TJS` : `${minPrice} - ${maxPrice} TJS`}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => openCategoryEditor(p)}
                          className="p-1.5 text-slate-600 hover:bg-amber-50 hover:text-amber-700 rounded-lg"
                          title="Изменить категорию товара"
                          aria-label={`Изменить категорию товара ${p.title}`}
                        >
                          <Layers className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenEditModal(p)}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs flex items-center gap-1"
                        >
                          <Edit3 className="w-3 h-3 text-amber-400" />
                          <span>Правка</span>
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(p.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </div>
      )}

      {activeTab === 'visitors' && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">Посещения сайта</h3>
              <p className="mt-1 text-xs text-slate-500">
                Сохраняются обезличенный идентификатор IP и сведения об устройстве, которые передаёт браузер. Точная модель доступна не на всех устройствах.
              </p>
            </div>
            <button
              type="button"
              onClick={() => { void loadVisitAnalytics(); }}
              disabled={isLoadingVisits}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoadingVisits ? 'animate-spin' : ''}`} />
              Обновить
            </button>
          </div>

          {isLoadingVisits && !visitAnalytics ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Загрузка посещений…</div>
          ) : visitAnalytics ? (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                  { label: 'Визиты сегодня', value: visitAnalytics.today.visits_count },
                  { label: 'Уникальные IP сегодня', value: visitAnalytics.today.unique_visitors_count },
                  { label: 'Визиты за всё время', value: visitAnalytics.all_time.visits_count },
                  { label: 'Уникальные IP за всё время', value: visitAnalytics.all_time.unique_visitors_count },
                ].map((metric) => (
                  <div key={metric.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                    <p className="text-[11px] font-medium text-slate-500">{metric.label}</p>
                    <p className="mt-1 font-mono text-2xl font-extrabold text-slate-900">{metric.value.toLocaleString()}</p>
                  </div>
                ))}
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <h4 className="border-b border-slate-200 px-4 py-3 text-sm font-bold text-slate-900">
                  Недавние посещения (до 200 записей)
                </h4>
                {visitAnalytics.recent_visits.length === 0 ? (
                  <p className="p-5 text-sm text-slate-500">Посещений пока нет.</p>
                ) : (
                  <div className="max-h-[55vh] overflow-auto">
                    <table className="w-full min-w-[560px] text-left text-xs">
                      <thead className="sticky top-0 bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-4 py-2 font-semibold">Посетитель (анонимно)</th>
                          <th className="px-4 py-2 font-semibold">Модель / ОС / браузер</th>
                          <th className="px-4 py-2 font-semibold">Время</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {visitAnalytics.recent_visits.map((visit, index) => (
                          <tr key={`${visit.visitor_id}-${visit.visited_at}-${index}`}>
                            <td className="px-4 py-2.5 font-mono text-slate-700">#{visit.visitor_id}</td>
                            <td className="px-4 py-2.5 text-slate-700">{visit.device_info}</td>
                            <td className="px-4 py-2.5 text-slate-600">
                              {new Date(visit.visited_at).toLocaleString(
                                language === 'tg' ? 'tg-TJ' : language === 'en' ? 'en-GB' : 'ru-RU',
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </section>
      )}

      {activeTab === 'searches' && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">Поисковые запросы</h3>
              <p className="mt-1 text-xs text-slate-500">
                Счётчики по запросам за всё время; IP и данные посетителей с поисками не связываются.
              </p>
            </div>
            <button
              type="button"
              onClick={() => { void loadSearchAnalytics(); }}
              disabled={isLoadingSearches}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoadingSearches ? 'animate-spin' : ''}`} />
              Обновить
            </button>
          </div>

          {isLoadingSearches && !searchAnalytics ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Загрузка поисков…</div>
          ) : searchAnalytics ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                  <p className="text-[11px] font-medium text-slate-500">Поисков всего</p>
                  <p className="mt-1 font-mono text-2xl font-extrabold text-slate-900">{searchAnalytics.total_searches.toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                  <p className="text-[11px] font-medium text-slate-500">Разных запросов</p>
                  <p className="mt-1 font-mono text-2xl font-extrabold text-slate-900">{searchAnalytics.unique_queries.toLocaleString()}</p>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <h4 className="border-b border-slate-200 px-4 py-3 text-sm font-bold text-slate-900">Самые частые поиски</h4>
                {searchAnalytics.popular_queries.length ? (
                  <ol className="divide-y divide-slate-100">
                    {searchAnalytics.popular_queries.map((query, index) => (
                      <li key={`popular-${query.query_text}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                        <span className="min-w-0 truncate font-medium text-slate-700">
                          <span className="mr-2 text-slate-400">{index + 1}.</span>{query.query_text}
                        </span>
                        <span className="shrink-0 rounded-full bg-amber-50 px-2 py-1 font-mono font-bold text-amber-800">{query.searches_count}</span>
                      </li>
                    ))}
                  </ol>
                ) : <p className="p-4 text-sm text-slate-500">Поисковых запросов пока нет.</p>}
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <h4 className="border-b border-slate-200 px-4 py-3 text-sm font-bold text-slate-900">
                  Все запросы ({searchAnalytics.unique_queries})
                </h4>
                {searchAnalytics.queries.length ? (
                  <>
                    <div className="max-h-[55vh] overflow-auto">
                      <table className="w-full min-w-[480px] text-left text-xs">
                        <thead className="sticky top-0 bg-slate-50 text-slate-500">
                          <tr>
                            <th className="px-4 py-2 font-semibold">Запрос</th>
                            <th className="px-4 py-2 font-semibold">Поисков</th>
                            <th className="px-4 py-2 font-semibold">Последний поиск</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {searchAnalytics.queries.map((query) => (
                            <tr key={query.query_text}>
                              <td className="px-4 py-2.5 font-medium text-slate-700">{query.query_text}</td>
                              <td className="px-4 py-2.5 font-mono text-slate-700">{query.searches_count.toLocaleString()}</td>
                              <td className="px-4 py-2.5 text-slate-600">
                                {new Date(query.last_searched_at).toLocaleString(
                                  language === 'tg' ? 'tg-TJ' : language === 'en' ? 'en-GB' : 'ru-RU',
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {searchAnalytics.has_more && (
                      <button
                        type="button"
                        onClick={() => { void loadSearchAnalytics(true); }}
                        disabled={isLoadingSearches}
                        className="w-full border-t border-slate-200 px-4 py-3 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        {isLoadingSearches ? 'Загрузка…' : 'Показать ещё'}
                      </button>
                    )}
                  </>
                ) : <p className="p-4 text-sm text-slate-500">Поисковых запросов пока нет.</p>}
              </div>
            </>
          ) : null}
        </section>
      )}

      {/* ========================================== */}
      {/* ВКЛАДКА 2: ТЕСТИРОВАНИЕ ИИ GEMINI */}
      {/* ========================================== */}
      {activeTab === 'gemini_ai' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-600" />
              <span>Тестирование ИИ Gemini 3.8 Flash</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Проверка генерации продающих заголовков, описаний и обязательных характеристик из китайского текста
            </p>
          </div>

          <div className="space-y-4 max-w-2xl text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Текст товара со страницы (1688 / Pinduoduo):
              </label>
              <textarea
                rows={4}
                value={geminiTestInput}
                onChange={(e) => setGeminiTestInput(e.target.value)}
                className="w-full p-3 border border-slate-300 rounded-xl text-sm font-sans"
              />
            </div>
            <button
              onClick={handleTestGemini}
              disabled={isGeminiTesting}
              className="px-6 py-3 bg-slate-900 hover:bg-purple-700 text-white font-bold rounded-xl text-xs transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isGeminiTesting ? 'Анализируем через Gemini...' : 'Отправить в Gemini 3.8 Flash'}</span>
            </button>

            {geminiResult && (
              <div className="mt-4 p-5 bg-purple-50/70 border border-purple-200 rounded-2xl space-y-3">
                <div className="font-bold text-purple-950 text-sm">Результат генерации:</div>
                <div className="space-y-2 text-xs text-purple-900">
                  <div><strong>Заголовок:</strong> {geminiResult.title}</div>
                  <div><strong>Категория:</strong> <span className="bg-purple-200 px-2 py-0.5 rounded font-semibold">{geminiResult.category_name}</span></div>
                  <div><strong>Описание (с характеристиками):</strong> {geminiResult.description}</div>
                  {geminiResult.specifications && (
                    <div>
                      <strong>Характеристики:</strong>
                      <div className="mt-1 grid grid-cols-2 gap-1 bg-white p-2.5 rounded-xl border border-purple-200">
                        {geminiResult.specifications.map((s: any, idx: number) => (
                          <div key={idx}>
                            <span className="text-slate-500">{s.name}:</span> <strong>{s.value}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* ВКЛАДКА 3: НАСТРОЙКИ */}
      {/* ========================================== */}
      {activeTab === 'settings' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm max-w-2xl">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Scale className="w-5 h-5 text-emerald-600" />
              <span>Финансовые и логистические параметры</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Фиксированная формула розничной цены и контакты для заказов
            </p>
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Курс юаня (фиксировано: 1 CNY = 1.45 TJS)
              </label>
              <input
                type="number"
                step="0.01"
                required
                readOnly
                value={settings.cny_tjs_rate}
                className="w-full p-3 border border-slate-300 rounded-xl text-sm font-mono font-bold bg-slate-100"
              />
              <span className="text-[10px] text-slate-400">
                Стоимость товара переводится в сомони без дополнительной наценки.
              </span>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Доставка за килограмм (фиксировано: 30 TJS)
              </label>
              <input
                type="number"
                step="1"
                required
                readOnly
                value={settings.delivery_per_kg_tjs}
                className="w-full p-3 border border-slate-300 rounded-xl text-sm font-mono font-bold bg-slate-100"
              />
              <span className="text-[10px] text-slate-400">
                Применяется только при отсутствии габаритов.
              </span>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Доставка за кубометр (фиксировано: 2 000 TJS)
              </label>
              <input
                type="number"
                step="1"
                readOnly
                value="2000"
                className="w-full p-3 border border-slate-300 rounded-xl text-sm font-mono font-bold bg-slate-100"
              />
              <span className="text-[10px] text-slate-400">
                Если размеры товара известны, стоимость доставки считается по объёму в м³ вместо веса.
              </span>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Номер телефона WhatsApp для заказов
              </label>
              <input
                type="text"
                required
                value={settings.whatsapp_phone}
                onChange={(e) => setSettings({ ...settings, whatsapp_phone: e.target.value })}
                className="w-full p-3 border border-slate-300 rounded-xl text-sm font-mono font-bold"
              />
              <span className="text-[10px] text-slate-400">
                Международный формат Таджикистана без плюса (например: 992444431).
              </span>
            </div>

            <section className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 space-y-3">
              <div>
                <h4 className="font-bold text-sky-950">Публикация товаров в Somon.tj</h4>
                <p className="mt-1 text-[10px] leading-relaxed text-sky-900/80">
                  XML-ленту нужно добавить в кабинете продавца Somon. В ленту попадут только опубликованные товары с настроенными рубрикой и обязательными атрибутами; Somon проверяет её по своему расписанию и может отправить объявления на модерацию.
                </p>
              </div>
              <div>
                <label className="mb-1 block font-bold text-slate-700">ID района Somon</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={settings.somon_district_id}
                  onChange={(e) => setSettings({ ...settings, somon_district_id: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 p-3 text-sm font-mono font-bold"
                />
                <span className="text-[10px] text-slate-500">Душанбе — 511.</span>
              </div>
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <label className="font-bold text-slate-700">ID рубрик Somon для категорий магазина</label>
                  <a
                    href="/business-xml-guide/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] font-semibold text-sky-700 underline"
                  >
                    Официальный справочник рубрик
                  </a>
                </div>
                <div className="space-y-2">
                  {categories.flatMap((category) => [
                    { id: category.id, name: category.name },
                    ...(category.subcategories || []).map((subcategory) => ({
                      id: subcategory.id,
                      name: `${category.name} / ${subcategory.name}`,
                    })),
                  ]).map((category) => (
                    <div key={category.id} className="rounded-xl border border-sky-100 bg-white p-3 space-y-2">
                      <label className="grid grid-cols-1 items-center gap-1 sm:grid-cols-[1fr_150px] sm:gap-3">
                        <span className="text-[10px] text-slate-700">{category.name}</span>
                        <input
                          type="number"
                          min="1"
                          value={settings.somon_category_config[String(category.id)]?.rubric_id || ''}
                          onChange={(e) => setSettings({
                            ...settings,
                            somon_category_config: {
                              ...settings.somon_category_config,
                              [String(category.id)]: {
                                rubric_id: e.target.value,
                                attributes_json: settings.somon_category_config[String(category.id)]?.attributes_json || '{}',
                              },
                            },
                          })}
                          placeholder="ID рубрики"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono"
                        />
                      </label>
                      <textarea
                        rows={2}
                        value={settings.somon_category_config[String(category.id)]?.attributes_json || '{}'}
                        onChange={(e) => setSettings({
                          ...settings,
                          somon_category_config: {
                            ...settings.somon_category_config,
                            [String(category.id)]: {
                              rubric_id: settings.somon_category_config[String(category.id)]?.rubric_id || '',
                              attributes_json: e.target.value,
                            },
                          },
                        })}
                        aria-label={`Атрибуты Somon для ${category.name}`}
                        className="w-full rounded-lg border border-slate-300 bg-white p-2 font-mono text-[10px]"
                      />
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                  В JSON задайте все обязательные поля рубрики. Значение `spec:Цвет` берётся из характеристики товара «Цвет», `const:2` передаёт постоянное значение. `condition` выгружается отдельным полем Somon. Пример: {'{"brand":"spec:Бренд","condition":"const:2"}'}.
                </p>
              </div>
              <p className="text-[10px] text-slate-600">
                Активных товаров с рубрикой и настроенными атрибутами: {adminProducts.filter((product) =>
                  product.status === 'active' &&
                  hasSomonCategoryConfig(product.category_id)
                ).length}
                {' · '}без полной настройки: {adminProducts.filter((product) =>
                  product.status === 'active' &&
                  !hasSomonCategoryConfig(product.category_id)
                ).length}
              </p>
              <div className="rounded-xl bg-white/80 p-3">
                <div className="mb-1 text-[10px] font-bold text-slate-700">Адрес XML-ленты</div>
                <a
                  href={apiUrl('/somon-feed.xml')}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-[11px] font-semibold text-sky-700 underline"
                >
                  {apiUrl('/somon-feed.xml')}
                </a>
              </div>
            </section>

            {/* Автоматический расчёт цены */}
            <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-2">
              <h3 className="font-bold text-amber-950 text-xs">Формула цены продажи</h3>
              <p className="text-[11px] text-amber-900/80 leading-relaxed">
                Цена = цена в CNY × 1,45 + доставка. Если импортированы габариты, доставка считается по объёму (м³ × 2 000 TJS); иначе — по весу (кг × 30 TJS).
              </p>
              <p className="text-[10px] text-slate-600">
                Пример автомобиля: 5 000 CNY × 1,45 = 7 250 TJS; 4,2 × 1,51 × 1,92 = 12,17664 м³; доставка ≈ 24 353 TJS; цена ≈ <strong>31 603 TJS</strong>.
              </p>
            </div>

            <div className="pt-3 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-colors shadow-sm flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>{settingsSaved ? '✓ Настройки сохранены' : 'Сохранить настройки'}</span>
              </button>

              <button
                type="button"
                onClick={handleRecalculatePrices}
                disabled={isRecalculatingPrices}
                className="px-5 py-3 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded-xl text-xs transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isRecalculatingPrices ? 'animate-spin' : ''}`} />
                <span>{isRecalculatingPrices ? 'Пересчет цен...' : 'Пересчитать все розничные цены'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ======================================================== */}
      {/* ВКЛАДКА 4: ЗАКАЗЫ КЛИЕНТОВ (ТРЕБОВАНИЕ 6) */}
      {/* ======================================================== */}
      {activeTab === 'orders' && (
        <div className="space-y-5">
          {/* Верхняя карточка с метриками заказов */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Всего заказов
              </span>
              <span className="text-xl sm:text-2xl font-black text-slate-900 font-mono mt-0.5 block">
                {orders.length}
              </span>
            </div>
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl shadow-xs">
              <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">
                Новые заказы
              </span>
              <span className="text-xl sm:text-2xl font-black text-amber-900 font-mono mt-0.5 block">
                {orders.filter((o) => o.status === 'new').length}
              </span>
            </div>
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl shadow-xs">
              <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wider block">
                В пути из Китая
              </span>
              <span className="text-xl sm:text-2xl font-black text-blue-900 font-mono mt-0.5 block">
                {orders.filter((o) => ['processing', 'ordered_china', 'in_transit'].includes(o.status)).length}
              </span>
            </div>
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl shadow-xs">
              <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
                Сумма заказов
              </span>
              <span className="text-lg sm:text-xl font-black text-emerald-950 font-mono mt-0.5 block">
                {orders.reduce((sum, o) => sum + (o.total_amount || 0), 0)} TJS
              </span>
            </div>
          </div>

          {/* Панель фильтров заказов */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-xs">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  placeholder="Поиск по номеру заказа (#MS-...), имени клиента или телефону..."
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:border-amber-400 focus:outline-hidden"
                />
              </div>

              <button
                type="button"
                onClick={loadOrders}
                disabled={isLoadingOrders}
                className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingOrders ? 'animate-spin' : ''}`} />
                <span>Обновить список</span>
              </button>
            </div>

            {/* Фильтры по статусам */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setOrderStatusFilter('all')}
                className={`px-3 py-1.5 rounded-xl transition-all ${
                  orderStatusFilter === 'all'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Все ({orders.length})
              </button>
              <button
                type="button"
                onClick={() => setOrderStatusFilter('new')}
                className={`px-3 py-1.5 rounded-xl transition-all ${
                  orderStatusFilter === 'new'
                    ? 'bg-amber-500 text-black font-bold shadow-xs'
                    : 'bg-amber-50 text-amber-900 hover:bg-amber-100'
                }`}
              >
                🟡 Новые ({orders.filter((o) => o.status === 'new').length})
              </button>
              <button
                type="button"
                onClick={() => setOrderStatusFilter('processing')}
                className={`px-3 py-1.5 rounded-xl transition-all ${
                  orderStatusFilter === 'processing'
                    ? 'bg-blue-600 text-white font-bold shadow-xs'
                    : 'bg-blue-50 text-blue-900 hover:bg-blue-100'
                }`}
              >
                🔵 В обработке
              </button>
              <button
                type="button"
                onClick={() => setOrderStatusFilter('ordered_china')}
                className={`px-3 py-1.5 rounded-xl transition-all ${
                  orderStatusFilter === 'ordered_china'
                    ? 'bg-purple-600 text-white font-bold shadow-xs'
                    : 'bg-purple-50 text-purple-900 hover:bg-purple-100'
                }`}
              >
                🟣 Заказан в Китае
              </button>
              <button
                type="button"
                onClick={() => setOrderStatusFilter('in_transit')}
                className={`px-3 py-1.5 rounded-xl transition-all ${
                  orderStatusFilter === 'in_transit'
                    ? 'bg-indigo-600 text-white font-bold shadow-xs'
                    : 'bg-indigo-50 text-indigo-900 hover:bg-indigo-100'
                }`}
              >
                🚚 В пути
              </button>
              <button
                type="button"
                onClick={() => setOrderStatusFilter('delivered')}
                className={`px-3 py-1.5 rounded-xl transition-all ${
                  orderStatusFilter === 'delivered'
                    ? 'bg-emerald-600 text-white font-bold shadow-xs'
                    : 'bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                }`}
              >
                🟢 Выдан / Доставлен
              </button>
              <button
                type="button"
                onClick={() => setOrderStatusFilter('cancelled')}
                className={`px-3 py-1.5 rounded-xl transition-all ${
                  orderStatusFilter === 'cancelled'
                    ? 'bg-red-600 text-white font-bold shadow-xs'
                    : 'bg-red-50 text-red-900 hover:bg-red-100'
                }`}
              >
                🔴 Отменен
              </button>
            </div>
          </div>

          {/* Список карточек заказов */}
          {isLoadingOrders ? (
            <div className="p-12 text-center text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-amber-500 mb-2" />
              <span>Загрузка заказов из базы...</span>
            </div>
          ) : orders.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center space-y-3 shadow-xs max-w-md mx-auto">
              <Package className="w-12 h-12 text-amber-400 mx-auto" />
              <h4 className="text-base font-bold text-slate-900">Заказов пока нет</h4>
              <p className="text-xs text-slate-500">
                Когда покупатель оформит заказ на витрине с переходом в WhatsApp, заказ мгновенно отобразится здесь с номером и полным перечнем товаров.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {orders
                .filter((o) => {
                  if (orderStatusFilter !== 'all' && o.status !== orderStatusFilter) return false;
                  if (orderSearch.trim()) {
                    const q = orderSearch.toLowerCase().trim();
                    const numMatch = (o.order_number || '').toLowerCase().includes(q);
                    const nameMatch = (o.customer_name || '').toLowerCase().includes(q);
                    const phoneMatch = (o.customer_phone || '').toLowerCase().includes(q);
                    if (!numMatch && !nameMatch && !phoneMatch) return false;
                  }
                  return true;
                })
                .map((order) => {
                  const statusColors: Record<string, { bg: string; text: string; label: string }> = {
                    new: { bg: 'bg-amber-100 border-amber-300', text: 'text-amber-900', label: '🟡 Новый заказ' },
                    processing: { bg: 'bg-blue-100 border-blue-300', text: 'text-blue-900', label: '🔵 В обработке' },
                    ordered_china: { bg: 'bg-purple-100 border-purple-300', text: 'text-purple-900', label: '🟣 Заказан на 1688' },
                    in_transit: { bg: 'bg-indigo-100 border-indigo-300', text: 'text-indigo-900', label: '🚚 В пути в Душанбе' },
                    delivered: { bg: 'bg-emerald-100 border-emerald-300', text: 'text-emerald-900', label: '🟢 Выдан покупателю' },
                    cancelled: { bg: 'bg-red-100 border-red-300', text: 'text-red-900', label: '🔴 Отменен' },
                  };

                  const currentSt = statusColors[order.status] || statusColors.new;
                  const cleanPhone = (order.customer_phone || '').replace(/[^0-9]/g, '');

                  return (
                    <div
                      key={order.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openOrderEditor(order)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openOrderEditor(order);
                        }
                      }}
                      className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs space-y-4 hover:border-emerald-300 transition-colors cursor-pointer"
                    >
                      {/* Хедер карточки заказа */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-base font-black text-slate-900 px-2.5 py-1 bg-slate-100 rounded-xl border border-slate-200">
                            {order.order_number}
                          </span>

                          <span className={`text-[11px] font-bold px-2.5 py-1 rounded-xl border ${currentSt.bg} ${currentSt.text}`}>
                            {currentSt.label}
                          </span>

                          {order.delivery_type === 'order' ? (
                            <span className="text-[10px] font-bold px-2.5 py-1 rounded-xl bg-amber-50 text-amber-900 border border-amber-200 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-amber-600" />
                              <span>Доставка 12–35 дней</span>
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-900 border border-emerald-200 flex items-center gap-1">
                              <Truck className="w-3 h-3 text-emerald-600" />
                              <span>В наличии на складе</span>
                            </span>
                          )}

                          <span className="text-[11px] text-slate-400 font-medium">
                            {order.created_at ? new Date(order.created_at).toLocaleString('ru-RU') : ''}
                          </span>
                        </div>

                        {/* Управление статусом заказа */}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openOrderEditor(order);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-xs font-bold"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            Изменить
                          </button>
                          <select
                            value={order.status}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(e) => handleUpdateOrderStatus(order.id, e.target.value)}
                            className="text-xs font-bold px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl focus:border-amber-400 focus:outline-hidden"
                          >
                            <option value="new">🟡 Новый</option>
                            <option value="processing">🔵 В обработке</option>
                            <option value="ordered_china">🟣 Заказан в Китае</option>
                            <option value="in_transit">🚚 В пути в Таджикистан</option>
                            <option value="delivered">🟢 Выдан / Доставлен</option>
                            <option value="cancelled">🔴 Отменен</option>
                          </select>

                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDeleteOrder(order.id, order.order_number);
                            }}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                            title="Удалить заказ"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Клиент и связь */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-slate-50/80 rounded-2xl border border-slate-100 text-xs">
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 block mb-0.5">ИМЯ ПОКУПАТЕЛЯ:</span>
                          <span className="font-bold text-slate-900">{order.customer_name || 'Клиент WhatsApp'}</span>
                        </div>

                        <div>
                          <span className="text-[10px] font-bold text-slate-400 block mb-0.5">ТЕЛЕФОН:</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-900">{order.customer_phone || 'Не указан'}</span>
                            {cleanPhone && (
                              <a
                                href={`https://wa.me/${cleanPhone}?text=${encodeURIComponent(`Здравствуйте, ${order.customer_name || ''}! По поводу вашего заказа ${order.order_number} в магазине M.Savdo:`)}`}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(event) => event.stopPropagation()}
                                className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold transition-colors"
                              >
                                <MessageSquare className="w-3 h-3" />
                                <span>WhatsApp</span>
                              </a>
                            )}
                          </div>
                        </div>

                        <div>
                          <span className="text-[10px] font-bold text-slate-400 block mb-0.5">СУММА К ОПЛАТЕ:</span>
                          <span className="text-sm font-black text-emerald-800 font-mono">{order.total_amount_tjs ?? order.total_amount} TJS</span>
                        </div>
                      </div>

                      {/* Список позиций в заказе */}
                      <div className="space-y-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Товары в заказе ({order.items?.length || 0}):
                        </span>
                        <div className="divide-y divide-slate-100 border border-slate-100 rounded-2xl overflow-hidden bg-white">
                          {(order.items || []).map((it, idx) => (
                            <div key={idx} className="p-3 flex items-center justify-between gap-3 text-xs">
                              <div className="flex items-center gap-3 min-w-0">
                                {it.image && (
                                  <img
                                    src={it.image}
                                    alt=""
                                    referrerPolicy="no-referrer"
                                    className="w-10 h-10 rounded-xl object-cover border border-slate-200 shrink-0"
                                  />
                                )}
                                <div className="min-w-0">
                                  <div className="font-bold text-slate-900 truncate">
                                    {it.title}
                                  </div>
                                  <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                                    <span>Цвет: <strong>{it.color || 'Стандарт'}</strong></span>
                                    <span>·</span>
                                    <span>Разм: <strong>{it.size || 'One Size'}</strong></span>
                                    <span>·</span>
                                    <span className="font-mono text-slate-400">{it.variant_sku}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="text-right shrink-0">
                                <div className="font-mono font-bold text-slate-900">
                                  {it.quantity} шт. × {it.price_tjs} TJS
                                </div>
                                <div className="text-[11px] font-mono font-black text-emerald-700">
                                  {it.quantity * it.price_tjs} TJS
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {editingOrder && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm"
          onClick={() => setEditingOrder(null)}
        >
          <form
            onSubmit={saveEditedOrder}
            onClick={(event) => event.stopPropagation()}
            className="max-h-[94vh] w-full max-w-4xl space-y-5 overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-7"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <h2 className="text-xl font-black text-slate-900">Редактирование заказа</h2>
                <p className="mt-1 font-mono text-sm font-bold text-slate-500">{editingOrder.order_number}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingOrder(null)}
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                aria-label="Закрыть"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex gap-3 rounded-2xl border-2 border-red-300 bg-red-50 p-4 text-sm text-red-900">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
              <div>
                <p className="font-extrabold">Финансовая безопасность платежей</p>
                <p className="mt-1 text-xs leading-relaxed">
                  Изменение суммы и состава заказа обновляет только данные заказа в магазине и не меняет уже проведённые платежи или транзакции. Сверяйте корректировки с платёжной системой отдельно.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1 text-xs font-bold text-slate-700">
                ФИО клиента
                <input
                  required
                  value={editingOrder.customer_name || ''}
                  onChange={(event) => setEditingOrder({ ...editingOrder, customer_name: event.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-medium outline-none focus:border-emerald-500"
                />
              </label>
              <label className="space-y-1 text-xs font-bold text-slate-700">
                Телефон
                <input
                  value={editingOrder.customer_phone || ''}
                  onChange={(event) => setEditingOrder({ ...editingOrder, customer_phone: event.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-medium outline-none focus:border-emerald-500"
                />
              </label>
              <label className="space-y-1 text-xs font-bold text-slate-700 sm:col-span-2">
                Адрес доставки
                <textarea
                  rows={2}
                  value={editingOrder.customer_address || ''}
                  onChange={(event) => setEditingOrder({ ...editingOrder, customer_address: event.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-medium outline-none focus:border-emerald-500"
                />
              </label>
              <label className="space-y-1 text-xs font-bold text-slate-700">
                Статус заказа
                <select
                  value={editingOrder.status}
                  onChange={(event) => setEditingOrder({ ...editingOrder, status: event.target.value as Order['status'] })}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-emerald-500"
                >
                  <option value="new">Новый</option>
                  <option value="processing">В обработке</option>
                  <option value="ordered_china">Заказан в Китае</option>
                  <option value="in_transit">В пути</option>
                  <option value="delivered">Выдан / доставлен</option>
                  <option value="cancelled">Отменён</option>
                </select>
              </label>
              <label className="space-y-1 text-xs font-bold text-slate-700">
                Итоговая сумма к оплате (TJS)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={editingOrder.total_amount_tjs ?? editingOrder.total_amount ?? 0}
                  onChange={(event) => setEditingOrder({
                    ...editingOrder,
                    total_amount_tjs: Number(event.target.value),
                    total_amount: Number(event.target.value),
                  })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-bold outline-none focus:border-emerald-500"
                />
              </label>
            </div>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-extrabold text-slate-900">
                  Состав заказа ({editingOrder.items?.length || 0})
                </h3>
                <button
                  type="button"
                  onClick={addOrderItem}
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
                >
                  <Plus className="h-4 w-4" />
                  Добавить позицию
                </button>
              </div>

              {(editingOrder.items || []).map((item, index) => (
                <div key={item.id ?? `order-item-${index}`} className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-extrabold text-slate-700">Позиция {index + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeOrderItem(index)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Удалить
                    </button>
                  </div>
                  <label className="block space-y-1 text-[11px] font-bold text-slate-600">
                    Название товара
                    <input
                      required
                      value={item.title}
                      onChange={(event) => updateEditingOrderItem(index, 'title', event.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none focus:border-emerald-500"
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <label className="space-y-1 text-[11px] font-bold text-slate-600">
                      Цвет
                      <input
                        value={item.color || ''}
                        onChange={(event) => updateEditingOrderItem(index, 'color', event.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none focus:border-emerald-500"
                      />
                    </label>
                    <label className="space-y-1 text-[11px] font-bold text-slate-600">
                      Размер
                      <input
                        value={item.size || ''}
                        onChange={(event) => updateEditingOrderItem(index, 'size', event.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none focus:border-emerald-500"
                      />
                    </label>
                    <label className="space-y-1 text-[11px] font-bold text-slate-600">
                      Артикул / SKU
                      <input
                        value={item.variant_sku || ''}
                        onChange={(event) => updateEditingOrderItem(index, 'variant_sku', event.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm font-medium text-slate-900 outline-none focus:border-emerald-500"
                      />
                    </label>
                    <label className="space-y-1 text-[11px] font-bold text-slate-600">
                      Количество
                      <input
                        type="number"
                        min="1"
                        step="1"
                        required
                        value={item.quantity}
                        onChange={(event) => updateEditingOrderItem(index, 'quantity', Number(event.target.value))}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none focus:border-emerald-500"
                      />
                    </label>
                    <label className="space-y-1 text-[11px] font-bold text-slate-600">
                      Цена за штуку (TJS)
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={item.price_tjs}
                        onChange={(event) => updateEditingOrderItem(index, 'price_tjs', Number(event.target.value))}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none focus:border-emerald-500"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </section>

            <div className="sticky bottom-0 flex justify-end border-t border-slate-200 bg-white pt-4">
              <button
                type="submit"
                disabled={isSavingOrder}
                className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-8 py-4 text-base font-black text-white shadow-lg transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {isSavingOrder ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                {isSavingOrder ? 'Сохранение...' : 'Сохранить изменения'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ======================================================== */}
      {/* МОДАЛЬНОЕ ОКНО СОЗДАНИЯ И РЕДАКТИРОВАНИЯ ТОВАРА */}
      {/* ======================================================== */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-5 sm:p-7 shadow-2xl border border-slate-200 max-h-[94vh] overflow-y-auto space-y-5 text-xs">
            <div className="flex justify-between items-start border-b border-slate-200 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 font-heading">
                    {editingProduct.id === 0 ? 'Создание нового товара вручную' : `Редактирование: ${editingProduct.base_sku}`}
                  </h3>
                  <span className="font-mono text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                    {editingProduct.base_sku}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Описание с характеристиками, фото вариантов из файлов/буфера и матрица SKU
                </p>
              </div>
              <button 
                onClick={() => setEditingProduct(null)} 
                className="p-1.5 text-slate-400 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
              >
                ✕
              </button>
            </div>

            {productSaveError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{productSaveError}</span>
              </div>
            )}

            <form onSubmit={handleSaveProduct} className="space-y-5">
              {/* НАЗВАНИЕ */}
              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  Название товара (для клиентской витрины) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editingProduct.title}
                  onChange={(e) => setEditingProduct({ ...editingProduct, title: e.target.value })}
                  placeholder="Например: Мужские легкие дышащие кроссовки Hyper-Breeze"
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              {/* ОПИСАНИЕ ТОВАРА */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-slate-800">
                    Описание товара (включая характеристики):
                  </label>
                  <button type="button" disabled={productSuggestionInProgress !== null} onClick={() => void handleProductSuggestion('description')}
                    className="rounded-lg bg-purple-100 px-2 py-1 text-[10px] font-bold text-purple-700 disabled:opacity-50">
                    {productSuggestionInProgress === 'description' ? 'Улучшаем…' : 'Улучшить описание'}
                  </button>
                </div>
                <textarea
                  rows={6}
                  value={editingProduct.description}
                  onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })}
                  placeholder="Опишите ключевые достоинства товара, а также характеристики:&#10;• Материал: 100% хлопок&#10;• Размеры: 40-44&#10;• Вес: 450г"
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-amber-500 outline-none leading-relaxed font-sans"
                />
              </div>

              {/* ТИП ДОСТАВКИ */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <label className="block font-bold text-slate-800 text-xs">
                  Тип товара и условия получения:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label className={`p-3 rounded-xl border-2 cursor-pointer flex items-start gap-2.5 transition-all ${
                    editingProduct.delivery_type === 'stock'
                      ? 'bg-emerald-50/80 border-emerald-500 text-emerald-950 font-bold shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/60'
                  }`}>
                    <input
                      type="radio"
                      name="delivery_type"
                      value="stock"
                      checked={editingProduct.delivery_type === 'stock'}
                      onChange={() => setEditingProduct({ ...editingProduct, delivery_type: 'stock' })}
                      className="mt-1 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <div className="flex items-center gap-1.5 text-emerald-900 font-bold">
                        <Truck className="w-4 h-4 text-emerald-600" />
                        <span>В наличии (stock)</span>
                      </div>
                      <div className="text-[10px] text-slate-500 font-normal mt-0.5">
                        Товар уже растаможен и находится на складе в г. Душанбе.
                      </div>
                    </div>
                  </label>

                  <label className={`p-3 rounded-xl border-2 cursor-pointer flex items-start gap-2.5 transition-all ${
                    editingProduct.delivery_type === 'order'
                      ? 'bg-amber-50/80 border-amber-500 text-amber-950 font-bold shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/60'
                  }`}>
                    <input
                      type="radio"
                      name="delivery_type"
                      value="order"
                      checked={editingProduct.delivery_type === 'order'}
                      onChange={() => setEditingProduct({ ...editingProduct, delivery_type: 'order' })}
                      className="mt-1 text-amber-600 focus:ring-amber-500"
                    />
                    <div>
                      <div className="flex items-center gap-1.5 text-amber-900 font-bold">
                        <Clock className="w-4 h-4 text-amber-600" />
                        <span>Под заказ (order)</span>
                      </div>
                      <div className="text-[10px] text-slate-500 font-normal mt-0.5">
                        Выкуп напрямую с фабрики 1688 / Pinduoduo по оптовой цене.
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* КАТЕГОРИЯ И СТАТУС */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-slate-800 text-xs">Категория каталога</label>
                    <button type="button" disabled={productSuggestionInProgress !== null} onClick={() => void handleProductSuggestion('category')}
                      className="text-[10px] font-bold text-purple-700 bg-purple-100 border border-purple-200 px-2 py-0.5 rounded-full flex items-center gap-1 disabled:opacity-50">
                      <Sparkles className="w-2.5 h-2.5 text-purple-600" />
                      <span>{productSuggestionInProgress === 'category' ? 'Подбираем…' : 'Подобрать категорию'}</span>
                    </button>
                  </div>
                  <select
                    value={editingProduct.category_id ? String(editingProduct.category_id) : ''}
                    onChange={(event) => {
                      const selectedCategory = categories
                        .flatMap((category) => category.subcategories || [])
                        .find((category) => String(category.id) === event.target.value);
                      setEditingProduct({
                        ...editingProduct,
                        category_id: selectedCategory?.id || null,
                        category_name: selectedCategory?.name || '',
                      });
                    }}
                    className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-amber-500 outline-none"
                  >
                    <option value="">
                      {editingProduct.id === 0 ? 'Выберите категорию или оставьте для ИИ' : 'Выберите подкатегорию'}
                    </option>
                    {categories.map((category) => (
                      <optgroup key={category.id} label={category.name}>
                        {(category.subcategories || []).map((subcategory) => (
                          <option key={subcategory.id} value={subcategory.id}>{subcategory.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-500">
                    {editingProduct.id === 0
                      ? 'Если оставить поле пустым, ИИ подберёт категорию по названию.'
                      : 'Выбранная подкатегория будет сохранена вместо автоматической классификации.'}
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="block font-bold text-slate-800 text-xs">Статус на витрине</label>
                  <select
                    value={editingProduct.status}
                    onChange={(e) => setEditingProduct({ ...editingProduct, status: e.target.value })}
                    className="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    <option value="active">active (Отображается на витрине)</option>
                    <option value="draft">draft (Скрыт в черновиках)</option>
                  </select>
                </div>
              </div>

              {/* ВИДЕО: порядок и добавление */}
              <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-2">
                  <label className="block font-bold text-slate-800 text-xs">
                    Видео ({getEditingVideos().length}) — порядок воспроизведения
                  </label>
                  {getEditingVideos().length > 0 && (
                    <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={Boolean(editingProduct.video_first)}
                        onChange={(e) => setEditingProduct({ ...editingProduct, video_first: e.target.checked })}
                        className="h-3.5 w-3.5 accent-amber-500"
                      />
                      Видео перед фото
                    </label>
                  )}
                </div>

                {getEditingVideos().map((url: string, idx: number, all: string[]) => (
                  <div
                    key={`${url}-${idx}`}
                    draggable
                    onDragStart={() => setDragVideoIndex(idx)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragVideoIndex !== null) moveVideo(dragVideoIndex, idx);
                      setDragVideoIndex(null);
                    }}
                    className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white p-1.5"
                  >
                    <span className="cursor-grab select-none px-1 text-slate-400" title="Перетащите">⋮⋮</span>
                    <span className="w-5 shrink-0 text-center text-[10px] font-black text-slate-500">{idx + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-slate-800" title={url}>{url}</span>
                    {idx === 0 && <span className="shrink-0 rounded bg-amber-400 px-1.5 py-0.5 text-[9px] font-black text-black">★ Главное</span>}
                    <button type="button" onClick={() => moveVideo(idx, idx - 1)} disabled={idx === 0} className="h-6 w-6 shrink-0 rounded bg-slate-100 text-xs font-bold disabled:opacity-30" title="Выше">↑</button>
                    <button type="button" onClick={() => moveVideo(idx, idx + 1)} disabled={idx === all.length - 1} className="h-6 w-6 shrink-0 rounded bg-slate-100 text-xs font-bold disabled:opacity-30" title="Ниже">↓</button>
                    <button
                      type="button"
                      onClick={() => setEditingVideos(all.filter((_, i) => i !== idx))}
                      className="h-6 w-6 shrink-0 rounded bg-red-600 text-white"
                      title="Удалить видео"
                    >
                      <Trash2 className="mx-auto h-3 w-3" />
                    </button>
                  </div>
                ))}

                <div className="flex gap-2">
                  <input
                    type="url"
                    value={newVideoUrl}
                    onChange={(e) => setNewVideoUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        (e.currentTarget.nextElementSibling as HTMLButtonElement | null)?.click();
                      }
                    }}
                    placeholder="Ссылка на видео (mp4 или YouTube)"
                    className="flex-1 rounded-xl border border-slate-300 bg-white p-2 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const url = newVideoUrl.trim();
                      if (!/^https?:\/\//i.test(url)) return;
                      const current = getEditingVideos();
                      if (!current.includes(url)) setEditingVideos([...current, url]);
                      setNewVideoUrl('');
                    }}
                    className="shrink-0 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800"
                  >
                    + Видео
                  </button>
                </div>
                <p className="text-[10px] text-slate-500">Первое видео — главное. Видео воспроизводятся по внешней ссылке и не загружаются на сервер.</p>
              </div>

              {/* ======================================================== */}
              {/* ФОТОГАЛЕРЕЯ: ФАЙЛЫ + БУФЕР ОБМЕНА + ССЫЛКИ */}
              {/* ======================================================== */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-emerald-600" />
                    <label className="font-bold text-slate-900 text-xs">
                      Фотогалерея ({editingProduct.images?.length || 0} фото):
                    </label>
                  </div>
                  <span className="text-[10px] text-slate-500">
                    Перетащите фото или используйте стрелки. Первое фото — главное (★)
                  </span>
                </div>

                {/* Скрытый инпут файлов */}
                <input
                  type="file"
                  ref={fileInputRef}
                  multiple
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />

                {/* Кнопки загрузки и вставки из буфера */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-3 bg-white border border-slate-300 hover:border-amber-400 hover:bg-amber-50/30 rounded-xl text-xs font-bold text-slate-800 flex items-center justify-center gap-2 transition-all shadow-xs"
                  >
                    <Upload className="w-4 h-4 text-amber-600" />
                    <span>📁 Загрузить фото из файлов</span>
                  </button>

                  <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-xs flex items-center justify-center gap-2 text-amber-900 font-semibold text-center">
                    <Clipboard className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Вставка из буфера обмена: нажмите <kbd className="px-1.5 py-0.5 bg-amber-200 text-black font-mono font-bold rounded text-[10px]">Ctrl+V</kbd></span>
                  </div>
                </div>

                {/* Добавление по URL */}
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={newImageUrl}
                    onChange={(e) => setNewImageUrl(e.target.value)}
                    placeholder="Или вставьте прямую ссылку на фото (https://...)"
                    className="flex-1 p-2 bg-white border border-slate-300 rounded-xl text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleAddGalleryImage}
                    className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors shrink-0"
                  >
                    + По ссылке
                  </button>
                </div>

                {/* Сетка фото в модале */}
                {editingProduct.images && editingProduct.images.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5 pt-2">
                    {editingProduct.images.map((img: string, idx: number) => {
                      const isMain = idx === 0;
                      return (
                        <div
                          key={`${img}-${idx}`}
                          draggable
                          onDragStart={() => setDragImageIndex(idx)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => {
                            if (dragImageIndex !== null) moveGalleryImage(dragImageIndex, idx);
                            setDragImageIndex(null);
                          }}
                          className={`relative cursor-grab overflow-hidden rounded-xl border bg-slate-200 shadow-xs aspect-square ${isMain ? 'border-amber-400 ring-2 ring-amber-300' : 'border-slate-300'}`}
                        >
                          <img src={img} alt="" draggable={false} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          <span className="absolute top-1 left-1 rounded bg-slate-900/80 px-1.5 py-0.5 text-[9px] font-black text-white">
                            {isMain ? '★ Главное' : idx + 1}
                          </span>
                          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-0.5 bg-black/70 p-0.5">
                            <button type="button" onClick={() => moveGalleryImage(idx, idx - 1)} disabled={idx === 0} className="h-6 w-6 rounded bg-white/90 text-xs font-bold text-black disabled:opacity-30" title="Влево">←</button>
                            {!isMain && (
                              <button type="button" onClick={() => moveGalleryImage(idx, 0)} className="h-6 rounded bg-amber-400 px-1.5 text-[10px] font-black text-black" title="Сделать главным">★</button>
                            )}
                            <button type="button" onClick={() => handleRemoveGalleryImage(idx)} className="h-6 w-6 rounded bg-red-600 text-white" title="Удалить фото">
                              <Trash2 className="mx-auto h-3 w-3" />
                            </button>
                            <button type="button" onClick={() => moveGalleryImage(idx, idx + 1)} disabled={idx === editingProduct.images.length - 1} className="h-6 w-6 rounded bg-white/90 text-xs font-bold text-black disabled:opacity-30" title="Вправо">→</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {editingColorOptions.length > 0 && (
                <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                  <div>
                    <label className="font-bold text-slate-800 text-xs">Фото для цветов</label>
                    <p className="mt-1 text-[10px] text-slate-500">
                      Назначьте фото каждому цвету. Оно появится рядом с названием цвета в карточке товара.
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {editingColorOptions.map((color) => {
                      const colorImageSpec = (editingProduct.specifications || []).find(
                        (spec: { name: string; value: string }) => spec.name === `${COLOR_IMAGE_SPEC_PREFIX}${color}`,
                      );
                      return (
                        <label key={color} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
                          {colorImageSpec?.value ? (
                            <img
                              src={colorImageSpec.value}
                              alt=""
                              className="h-10 w-10 shrink-0 rounded-lg border border-slate-200 object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <span className="h-10 w-10 shrink-0 rounded-lg bg-slate-200" />
                          )}
                          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800">{color}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveColorOption(color)}
                            aria-label={`Удалить цвет ${color}`}
                            title="Удалить этот вариант цвета"
                            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                          >
                            <X className="h-4 w-4" />
                          </button>
                          <select
                            value={colorImageSpec?.value || ''}
                            onChange={(event) => handleUpdateColorImage(color, event.target.value)}
                            aria-label={`Фото для цвета ${color}`}
                            className="max-w-36 rounded-lg border border-slate-300 bg-white p-2 text-[10px]"
                          >
                            <option value="">Не назначено</option>
                            {(editingProduct.images || []).map((image: string, imageIndex: number) => (
                              <option key={`${imageIndex}-${image}`} value={image}>Фото {imageIndex + 1}</option>
                            ))}
                          </select>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* МАТРИЦА ВАРИАНТОВ SKU */}
              <div className="space-y-3 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="font-bold text-slate-800 text-xs">Матрица вариантов SKU:</label>
                    <p className="text-[10px] text-slate-400">Цены закупки, розничные цены в TJS и фото вариантов (из файлов/буфера)</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddVariantRow}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-black font-black text-xs rounded-xl transition-colors shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Добавить вариант</span>
                  </button>
                </div>

                <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                  {editingProduct.variants?.map((v: any, vIdx: number) => (
                    <div key={vIdx} className="p-2 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-2 sm:grid-cols-12 gap-1.5 items-center text-[11px]">
                      <div className="sm:col-span-3">
                        <span className="block text-[10px] font-bold text-slate-500 mb-0.5">Цвет:</span>
                        <input
                          type="text"
                          required
                          value={v.color || ''}
                          onChange={(e) => handleUpdateVariantField(vIdx, 'color', e.target.value)}
                          placeholder="Черный"
                          className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold focus:border-amber-400 outline-none"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <span className="block text-[10px] font-bold text-slate-500 mb-0.5">Размер:</span>
                        <input
                          type="text"
                          required
                          value={v.size || ''}
                          onChange={(e) => handleUpdateVariantField(vIdx, 'size', e.target.value)}
                          placeholder="42 / L"
                          className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs focus:border-amber-400 outline-none"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <span className="block text-[10px] font-bold text-slate-500 mb-0.5">Цена закупки (CNY):</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={v.price_cny ?? 0}
                          onChange={(e) => handleUpdateVariantField(vIdx, 'price_cny', Number(e.target.value))}
                          className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-mono focus:border-amber-400 outline-none"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <span className="block text-[10px] font-bold text-slate-500 mb-0.5">Цена продажи (TJS):</span>
                        <input
                          type="number"
                          required
                          min="0"
                          step="1"
                          value={v.price_tjs ?? calculatePriceTjs(Number(v.price_cny) || 0, Number(v.weight_kg) || 0.5, Number(v.volume_m3) || 0)}
                          onChange={(e) => handleUpdateVariantField(vIdx, 'price_tjs', e.target.value === '' ? '' : Number(e.target.value))}
                          className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-black text-slate-900 focus:border-amber-400 outline-none"
                        />
                      </div>
                      <div className="sm:col-span-1">
                        <span className="block text-[10px] font-bold text-slate-500 mb-0.5">Stock:</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={v.stock ?? 10}
                          onChange={(e) => handleUpdateVariantField(vIdx, 'stock', Number(e.target.value))}
                          className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-mono focus:border-amber-400 outline-none"
                        />
                      </div>
                      <div className="sm:col-span-1">
                        <span className="block text-[10px] font-bold text-slate-500 mb-0.5">Вес, кг:</span>
                        <input
                          type="number"
                          required
                          min="0.01"
                          step="0.01"
                          value={v.weight_kg ?? 0.5}
                          onChange={(e) => handleUpdateVariantField(vIdx, 'weight_kg', Number(e.target.value))}
                          className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-mono focus:border-amber-400 outline-none"
                        />
                      </div>
                      <div className="sm:col-span-1 flex justify-end sm:pt-4">
                        <button
                          type="button"
                          disabled={editingProduct.variants.length <= 1}
                          onClick={() => handleRemoveVariantRow(vIdx)}
                          className="p-2 text-slate-400 hover:text-red-600 disabled:opacity-20 rounded-xl hover:bg-red-50 transition-colors"
                          title="Удалить вариант"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="sm:col-span-3">
                        <span className="block text-[10px] font-bold text-slate-500 mb-0.5">Артикул варианта:</span>
                        <input
                          type="text"
                          value={v.variant_sku || ''}
                          onChange={(e) => handleUpdateVariantField(vIdx, 'variant_sku', e.target.value)}
                          placeholder="Автоматически при создании"
                          className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-mono focus:border-amber-400 outline-none"
                        />
                      </div>
                      <div className="sm:col-span-9">
                        <span className="block text-[10px] font-bold text-slate-500 mb-0.5">Фото варианта:</span>
                        <div className="flex items-center gap-1.5">
                          {v.image_url ? (
                            <div className="relative group shrink-0">
                              <img
                                src={v.image_url}
                                alt=""
                                className="w-8 h-8 rounded-lg object-cover border border-slate-300 shadow-xs"
                                referrerPolicy="no-referrer"
                              />
                              <button
                                type="button"
                                onClick={() => handleUpdateVariantField(vIdx, 'image_url', '')}
                                className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center text-[9px] shadow-xs hover:bg-red-700"
                                title="Очистить фото"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <div className="w-8 h-8 rounded-lg border border-dashed border-slate-300 flex items-center justify-center text-slate-400 shrink-0 bg-white">
                              <ImageIcon className="w-4 h-4" />
                            </div>
                          )}

                          <select
                            value={(editingProduct.images || []).includes(v.image_url) ? v.image_url : ''}
                            onChange={(e) => {
                              if (e.target.value) handleUpdateVariantField(vIdx, 'image_url', e.target.value);
                            }}
                            className="max-w-40 p-1.5 bg-white border border-slate-300 rounded-xl text-[10px] focus:border-amber-400 outline-none"
                            aria-label={`Выбрать изображение для цвета ${v.color || ''}`}
                          >
                            <option value="">Выбрать из галереи</option>
                            {(editingProduct.images || []).map((image: string, imageIndex: number) => (
                              <option key={`${imageIndex}-${image}`} value={image}>
                                Фото {imageIndex + 1}{editingProduct.main_image === image ? ' (главное)' : ''}
                              </option>
                            ))}
                          </select>

                          <input
                            type="text"
                            value={v.image_url || ''}
                            onChange={(e) => handleUpdateVariantField(vIdx, 'image_url', e.target.value)}
                            placeholder="URL или фото..."
                            className="flex-1 min-w-0 p-1.5 bg-white border border-slate-300 rounded-xl text-[11px] focus:border-amber-400 outline-none"
                          />

                          <button
                            type="button"
                            onClick={() => handlePasteVariantImage(vIdx)}
                            className="p-2 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-xl text-[10px] font-bold shrink-0 transition-colors"
                            title="Вставить фото или ссылку из буфера обмена (Ctrl+V)"
                          >
                            <Clipboard className="w-3.5 h-3.5" />
                          </button>

                          <label
                            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-bold cursor-pointer shrink-0 transition-colors"
                            title="Загрузить фото из файла"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleVariantFileUpload(vIdx, file);
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Кнопки сохранения */}
              <div className="pt-4 flex justify-between items-center border-t border-slate-200">
                <button
                  type="button"
                  disabled={isSavingProduct}
                  onClick={() => setEditingProduct(null)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-600 font-medium hover:bg-slate-50 transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isSavingProduct}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
                >
                  {isSavingProduct ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Сохранение...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>{editingProduct.id === 0 ? 'Создать товар' : 'Сохранить изменения'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {categoryEditorProduct && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-category-dialog-title"
            className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="product-category-dialog-title" className="text-base font-bold text-slate-900">Изменить категорию</h2>
                <p className="mt-1 line-clamp-2 text-xs text-slate-500">{categoryEditorProduct.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setCategoryEditorProduct(null)}
                disabled={isSavingCategory}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Закрыть"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-700">Подкатегория каталога</span>
              <select
                value={categoryDraftId}
                onChange={(event) => setCategoryDraftId(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
              >
                <option value="" disabled>Выберите подкатегорию</option>
                {categories.map((category) => (
                  <optgroup key={category.id} label={category.name}>
                    {(category.subcategories || []).map((subcategory) => (
                      <option key={subcategory.id} value={subcategory.id}>{subcategory.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCategoryEditorProduct(null)}
                disabled={isSavingCategory}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => void handleSaveProductCategory()}
                disabled={isSavingCategory || !categoryDraftId}
                className="rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-amber-500 disabled:opacity-50"
              >
                {isSavingCategory ? 'Сохранение…' : 'Сохранить'}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Модальное окно импорта */}
      <ImportProductModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={() => {
          loadAdminData();
          onRefreshCatalog();
        }}
      />

      {/* Модальное окно экспорта кода Chrome-расширения */}
      <ExportCodeModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
      />

    </div>
  );
};
