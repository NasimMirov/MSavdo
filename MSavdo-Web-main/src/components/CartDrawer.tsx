import React, { useState } from 'react';
import { CartItem } from '../types';
import { X, Trash2, Plus, Minus, Send, ShoppingBag, ShieldAlert, Check, Clock, Truck } from 'lucide-react';
import { apiFetch } from '../api';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  onUpdateQuantity: (id: string, delta: number) => void;
  onRemoveItem: (id: string) => void;
  onClearCart: () => void;
  onOpenRules: () => void;
  whatsappPhone?: string;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  items,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onOpenRules,
  whatsappPhone = '992444431',
}) => {
  const [agreedWithRules, setAgreedWithRules] = useState(false);
  const [showPreOrderModal, setShowPreOrderModal] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const totalSum = items.reduce((sum, item) => sum + item.price_tjs * item.quantity, 0);

  // Проверка: есть ли в корзине товары под заказ из Китая (срок 15-30 дней)
  const hasPreOrderItems = items.some((item) => item.delivery_type !== 'stock');

  // Шаг 1: Нажатие на кнопку оформления
  const handleInitiateCheckout = () => {
    if (!agreedWithRules || items.length === 0) return;

    if (hasPreOrderItems) {
      // Требование 5: Показать всплывающее окно с предупреждением большими буквами
      setShowPreOrderModal(true);
    } else {
      executeCheckout();
    }
  };

  // Шаг 2: Регистрация заказа на сервере и переход в WhatsApp
  const executeCheckout = async () => {
    setIsSubmitting(true);
    let orderNumber = `MS-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    try {
      const res = await apiFetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: customerName.trim() || 'Клиент WhatsApp',
          customer_phone: customerPhone.trim(),
          customer_address: customerAddress.trim(),
          total_amount: totalSum,
          delivery_type: hasPreOrderItems ? 'order' : 'stock',
          items: items.map((i) => ({
            product_id: i.product_id,
            base_sku: i.base_sku,
            variant_sku: i.variant_sku,
            title: i.title,
            color: i.color,
            size: i.size,
            price_tjs: i.price_tjs,
            image: i.image,
            quantity: i.quantity,
          })),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data?.order_number) {
          orderNumber = data.order_number;
        }
      }
    } catch (e) {
      console.warn('[Cart] Ошибка локальной записи заказа:', e);
    } finally {
      setIsSubmitting(false);
      setShowPreOrderModal(false);
    }

    // Формирование текста заказа в WhatsApp строго с указанием Номера заказа, Названия, Цвета, Размера, Артикула SKU и цены в TJS
    const itemsText = items.map((item, index) => {
      const lineTotal = item.price_tjs * item.quantity;
      return [
        `📦 Позиция #${index + 1}:`,
        `• Товар: ${item.title}`,
        `• Артикул: ${item.variant_sku}`,
        `• Цвет: ${item.color || 'Стандарт'}`,
        `• Размер: ${item.size || 'One Size'}`,
        `• Количество: ${item.quantity} шт.`,
        `• Цена: ${item.price_tjs} TJS (Сумма: ${lineTotal} TJS)`
      ].join('\n');
    }).join('\n\n');

    const customerDetails = [
      customerName ? `👤 Клиент: ${customerName}` : '',
      customerPhone ? `📞 Телефон: ${customerPhone}` : '',
      customerAddress ? `📍 Адрес: ${customerAddress}` : '',
    ].filter(Boolean).join('\n');

    const message = [
      `Здравствуйте! Оформляю заказ #${orderNumber} в магазине M.Savdo (@MSavdo.tj):`,
      customerDetails ? `\n${customerDetails}\n` : '',
      itemsText,
      ``,
      `💰 ИТОГО К ОПЛАТЕ: ${totalSum} TJS`,
      hasPreOrderItems
        ? `🚚 Срок доставки: ТОВАР ПОД ЗАКАЗ ИЗ КИТАЯ (15–30 ДНЕЙ) — СОГЛАСИЕ ПОДТВЕРЖДЕНО`
        : `🚚 Доставка: В наличии на складе (1-2 дня)`,
      `✓ С правилами сервиса (возврат строго на карту плательщика) ознакомлен и согласен.`
    ].filter(Boolean).join('\n');

    const cleanPhone = whatsappPhone.replace(/[^0-9]/g, '');
    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.location.href = waUrl;
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white border-l border-slate-200 shadow-2xl flex flex-col justify-between">
          
          {/* Заголовок корзины */}
          <div className="p-5 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-emerald-700" />
              <h2 className="text-lg font-bold text-slate-900 font-heading">
                Корзина покупок
              </h2>
              <span className="text-xs text-slate-500 font-mono">({items.length})</span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors"
              aria-label="Закрыть корзину"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Список товаров */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {items.length === 0 ? (
              <div className="py-20 text-center text-slate-400 space-y-3">
                <ShoppingBag className="w-12 h-12 mx-auto text-slate-200" />
                <p className="text-sm font-semibold text-slate-700">В корзине пока пусто</p>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">
                  Выберите понравившийся товар в каталоге, укажите нужный цвет и размер.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {items.map((item) => (
                  <div key={item.id} className="py-4 flex items-start gap-3">
                    <img
                      src={item.image || 'https://placehold.co/100x100?text=M.Savdo'}
                      alt={item.title}
                      referrerPolicy="no-referrer"
                      className="w-16 h-18 rounded-xl object-cover border border-slate-200 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-mono font-bold text-slate-400">
                        {item.variant_sku}
                      </div>
                      <h4 className="text-xs font-bold text-slate-900 line-clamp-1 leading-snug">
                        {item.title}
                      </h4>

                      {/* Параметры варианта: Цвет и Размер */}
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-1 font-medium">
                        {item.color && item.color !== 'Стандарт' && (
                          <span className="text-slate-700">Цвет: <strong>{item.color}</strong></span>
                        )}
                        {item.color && item.color !== 'Стандарт' && item.size && item.size !== 'One Size' && (
                          <span className="text-slate-300">·</span>
                        )}
                        {item.size && item.size !== 'One Size' && (
                          <span className="text-slate-700">Разм: <strong>{item.size}</strong></span>
                        )}
                      </div>

                      <div className="text-xs font-mono font-bold text-emerald-800 mt-1.5">
                        {item.price_tjs} TJS
                      </div>

                      {/* Управление количеством */}
                      <div className="flex items-center justify-between mt-2.5">
                        <div className="flex items-center border border-slate-200 rounded-lg bg-slate-50">
                          <button
                            onClick={() => onUpdateQuantity(item.id, -1)}
                            className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-l transition-colors"
                            title="Уменьшить"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="px-3 text-xs font-mono font-semibold text-slate-800">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => onUpdateQuantity(item.id, 1)}
                            className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-r transition-colors"
                            title="Увеличить"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-slate-900">
                            {item.price_tjs * item.quantity} TJS
                          </span>
                          <button
                            onClick={() => onRemoveItem(item.id)}
                            className="text-slate-400 hover:text-red-600 transition-colors p-1"
                            title="Удалить"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Нижний блок с подтверждением и кнопкой WhatsApp */}
          {items.length > 0 && (
            <div className="p-5 border-t border-slate-200 bg-slate-50/80 space-y-4">
              <div className="flex items-center justify-between text-base font-bold text-slate-900">
                <span>Итого к оплате:</span>
                <span className="text-2xl font-mono text-emerald-800">{totalSum} TJS</span>
              </div>

              {/* Авторитетный инфо-блок срока доставки */}
              <div className="p-3 bg-amber-50/90 border border-amber-200/90 rounded-xl flex items-center gap-2.5 text-xs text-slate-800 shadow-xs">
                <Truck className="w-4 h-4 text-amber-600 shrink-0" />
                <span><strong>🚚 Срок доставки:</strong> под заказ 15–30 дней напрямую с фабрики</span>
              </div>

              {/* ОБЯЗАТЕЛЬНЫЙ ЧЕКБОКС: БЕЗ НЕГО ЗАКАЗ ЗАБЛОКИРОВАН */}
              <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreedWithRules}
                    onChange={(e) => setAgreedWithRules(e.target.checked)}
                    className="mt-0.5 w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500 cursor-pointer"
                  />
                  <span className="text-[11px] text-slate-800 leading-tight">
                    Я ознакомлен и согласен с{' '}
                    <button
                      type="button"
                      onClick={onOpenRules}
                      className="text-emerald-700 underline font-semibold hover:text-emerald-800"
                    >
                      Правилами сервиса M.Savdo
                    </button>{' '}
                    (включая пункт 6: возврат строго на карту плательщика).
                  </span>
                </label>

                {!agreedWithRules && (
                  <div className="flex items-center gap-1.5 text-[10px] text-amber-800 font-medium">
                    <ShieldAlert className="w-3 h-3 text-amber-600 shrink-0" />
                    <span>Отметьте согласие для активации кнопки заказа</span>
                  </div>
                )}
              </div>

              {/* КНОПКА ЗАКАЗА В WHATSAPP */}
              <button
                disabled={!agreedWithRules}
                onClick={handleInitiateCheckout}
                className={`w-full py-4 px-4 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-sm ${
                  agreedWithRules
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer hover:shadow'
                    : 'bg-slate-300 text-slate-500 cursor-not-allowed opacity-80'
                }`}
              >
                <Send className="w-4 h-4" />
                <span>Оформить заказ в WhatsApp</span>
              </button>

              <div className="flex justify-between items-center text-[10px] text-slate-400">
                <span>Менеджер: +{whatsappPhone}</span>
                <button
                  onClick={onClearCart}
                  className="hover:text-red-600 transition-colors"
                >
                  Очистить корзину
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* МОДАЛЬНОЕ ОКНО ПРЕДУПРЕЖДЕНИЯ О ДОСТАВКЕ ИЗ КИТАЯ 15-30 ДНЕЙ (ТРЕБОВАНИЕ 5) */}
      {showPreOrderModal && (
        <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border-4 border-amber-400 text-center space-y-6 animate-scale-up">
            
            <div className="w-16 h-16 bg-amber-100 border-2 border-amber-400 text-amber-600 rounded-2xl mx-auto flex items-center justify-center shadow-md">
              <Clock className="w-9 h-9" />
            </div>

            <div className="space-y-3">
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tight font-heading leading-snug">
                ВНИМАНИЕ! ТОВАР ДОСТАВЛЯЕТСЯ ИЗ КИТАЯ В ТЕЧЕНИЕ 15–30 ДНЕЙ
              </h3>
              <p className="text-base sm:text-lg font-extrabold text-amber-700">
                Вы согласны со сроками доставки?
              </p>
              <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
                Все товары выкупаются напрямую с фабрик Китая под ваш заказ, проходят контроль качества на складе консолидации и отправляются в Таджикистан.
              </p>
            </div>

            {/* Быстрые контактные данные покупателя */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-left space-y-2.5">
              <label className="block text-[11px] font-bold text-slate-700">
                Ваше имя и номер телефона (для отслеживания заказа):
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Ваше имя"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full text-xs px-3 py-2.5 bg-white border border-slate-300 rounded-xl focus:border-amber-400 focus:outline-hidden"
                />
                <input
                  type="tel"
                  placeholder="+992 00 000 0000"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full text-xs px-3 py-2.5 bg-white border border-slate-300 rounded-xl focus:border-amber-400 focus:outline-hidden font-mono"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowPreOrderModal(false)}
                className="w-full sm:w-1/3 py-3.5 px-4 rounded-xl font-bold text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={executeCheckout}
                className="w-full sm:w-2/3 py-3.5 px-6 rounded-xl font-black text-sm uppercase tracking-wider text-black bg-amber-400 hover:bg-amber-300 transition-all shadow-lg hover:shadow-amber-400/50 cursor-pointer flex items-center justify-center gap-2"
              >
                {isSubmitting ? 'Регистрация...' : '✓ ДА, Я СОГЛАСЕН(НА)'}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
