import React, { useState } from 'react';
import { CartItem, Product } from '../types';
import { X, Trash2, Plus, Minus, Send, ShoppingBasket, ShieldAlert, Clock, Truck } from 'lucide-react';
import { apiFetch } from '../api';
import { useI18n } from '../i18n';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  products: Product[];
  onUpdateQuantity: (id: string, delta: number) => void;
  onAddVariant: (itemId: string, variant: NonNullable<Product['variants']>[number]) => void;
  onRemoveItem: (id: string) => void;
  onClearCart: () => void;
  onOpenRules: () => void;
  whatsappPhone?: string;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  items,
  products,
  onUpdateQuantity,
  onAddVariant,
  onRemoveItem,
  onClearCart,
  onOpenRules,
  whatsappPhone = '992444431',
}) => {
  const { t, language } = useI18n();
  const [agreedWithRules, setAgreedWithRules] = useState(false);
  const [showPreOrderModal, setShowPreOrderModal] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [submitError, setSubmitError] = useState('');

  const copy = {
    ru: {
      total: 'ИТОГО К ОПЛАТЕ',
      greeting: 'Ассаламу Алайкум!',
      deliveryOrder: 'Доставка: 12–35 дней',
      deliveryStock: 'Доставка: в наличии на складе, 1 день',
      standard: 'Стандарт',
      oneSize: 'Единый размер',
      customer: 'Клиент',
      phone: 'Телефон',
      address: 'Адрес',
      deliveryTitle: 'СРОК ДОСТАВКИ: ОТ 12 ДО 35 ДНЕЙ',
      deliveryQuestion: 'Вы согласны с ориентировочным сроком доставки?',
      deliveryDescription: 'Доставку из Китая до пункта приёма M.Savdo выполняют наши карго-партнёры. В редких случаях возможны задержки по независящим от M.Savdo причинам.',
      detailsLabel: 'Контактные данные для связи по заказу:',
      namePlaceholder: 'Ваше имя',
      phonePlaceholder: '+992 00 000 0000',
      addressPlaceholder: 'Адрес доставки (необязательно)',
      phoneRequired: 'Укажите номер телефона.',
      phoneInvalid: 'Введите корректный номер: от 7 до 15 цифр.',
      orderFailed: 'Не удалось сохранить заказ. Попробуйте ещё раз.',
      cancel: 'Отмена',
      confirm: 'ПОДТВЕРДИТЬ И ПЕРЕЙТИ В WHATSAPP',
      submitting: 'Регистрация…',
      deliveryTime: 'Срок доставки:',
      preOrderTime: 'доставка 12–35 дней',
      stockTime: 'в наличии · 1 день',
      agreeRequired: 'Отметьте согласие для активации кнопки заказа',
      clearCart: 'Очистить корзину',
      manager: 'Менеджер',
      chooseVariant: 'Цвет / размер',
      addVariantHint: 'Выберите ещё один вариант — он добавится отдельной позицией.',
      orderLabel: 'Заказ',
    },
    tg: {
      total: 'ҲАМАГӢ БАРОИ ПАРДОХТ',
      greeting: 'Ассаламу Алайкум!',
      deliveryOrder: 'Расонидан: 12–35 рӯз',
      deliveryStock: 'Расонидан: дар анбор, 1 рӯз',
      standard: 'Стандарт',
      oneSize: 'Андозаи ягона',
      customer: 'Муштарӣ',
      phone: 'Телефон',
      address: 'Суроға',
      deliveryTitle: 'МУҲЛАТИ РАСОНИДАН: АЗ 12 ТО 35 РӮЗ',
      deliveryQuestion: 'Оё шумо бо муҳлати тахминии расонидан розӣ ҳастед?',
      deliveryDescription: 'Расонидани мол аз Чин то нуқтаи қабули M.Savdo аз ҷониби ширкатҳои каргои ҳамкор анҷом дода мешавад. Дар ҳолатҳои кам бо сабабҳои ба M.Savdo вобаста набуда таъхир мешавад.',
      detailsLabel: 'Маълумоти тамос барои фармоиш:',
      namePlaceholder: 'Номи шумо',
      phonePlaceholder: '+992 00 000 0000',
      addressPlaceholder: 'Суроғаи расонидан (ихтиёрӣ)',
      phoneRequired: 'Рақами телефонро ворид кунед.',
      phoneInvalid: 'Рақами дурустро ворид кунед: аз 7 то 15 рақам.',
      orderFailed: 'Фармоиш сабт нашуд. Дубора кӯшиш кунед.',
      cancel: 'Бекор кардан',
      confirm: 'ТАСДИҚ ВА ГУЗАШТАН БА WHATSAPP',
      submitting: 'Сабт шуда истодааст…',
      deliveryTime: 'Муҳлати расонидан:',
      preOrderTime: 'расонидан 12–35 рӯз',
      stockTime: 'дар анбор · 1 рӯз',
      agreeRequired: 'Барои фармоиш розигиро тасдиқ кунед',
      clearCart: 'Холӣ кардани сабад',
      manager: 'Менеҷер',
      chooseVariant: 'Ранг / андоза',
      addVariantHint: 'Варианти дигарро интихоб кунед — он ҳамчун мавқеи алоҳида илова мешавад.',
      orderLabel: 'Фармоиш',
    },
    en: {
      total: 'TOTAL',
      greeting: 'Ассаламу Алайкум!',
      deliveryOrder: 'Delivery: 12–35 days',
      deliveryStock: 'Delivery: in stock, 1 day',
      standard: 'Standard',
      oneSize: 'One size',
      customer: 'Customer',
      phone: 'Phone',
      address: 'Address',
      deliveryTitle: 'ESTIMATED DELIVERY: 12–35 DAYS',
      deliveryQuestion: 'Do you agree to the estimated delivery time?',
      deliveryDescription: 'Our cargo partners transport items from China to the M.Savdo receiving point. Rare delays may occur for reasons beyond M.Savdo’s control.',
      detailsLabel: 'Contact details for your order:',
      namePlaceholder: 'Your name',
      phonePlaceholder: '+992 00 000 0000',
      addressPlaceholder: 'Delivery address (optional)',
      phoneRequired: 'Enter your phone number.',
      phoneInvalid: 'Enter a valid number with 7–15 digits.',
      orderFailed: 'Could not save your order. Please try again.',
      cancel: 'Cancel',
      confirm: 'CONFIRM AND CONTINUE TO WHATSAPP',
      submitting: 'Saving…',
      deliveryTime: 'Delivery time:',
      preOrderTime: 'delivery in 12–35 days',
      stockTime: 'in stock · 1 day',
      agreeRequired: 'Accept the rules to enable checkout',
      clearCart: 'Clear cart',
      manager: 'Manager',
      chooseVariant: 'Color / size',
      addVariantHint: 'Choose another option to add it as a separate item.',
      orderLabel: 'Order',
    },
  }[language];

  if (!isOpen) return null;

  const totalSum = items.reduce((sum, item) => sum + item.price_tjs * item.quantity, 0);

  // Проверка: есть ли товары с доставкой из Китая за 12–35 дней.
  const hasPreOrderItems = items.some((item) => item.delivery_type !== 'stock');
  const phoneDigits = customerPhone.replace(/\D/g, '');
  const isPhoneValid = /^[+()\d\s.-]+$/.test(customerPhone.trim())
    && phoneDigits.length >= 7
    && phoneDigits.length <= 15;

  const handleInitiateCheckout = () => {
    if (!agreedWithRules || items.length === 0) return;
    setPhoneError('');
    setSubmitError('');
    setShowPreOrderModal(true);
  };

  const executeCheckout = async () => {
    if (!customerPhone.trim()) {
      setPhoneError(copy.phoneRequired);
      return;
    }
    if (!isPhoneValid) {
      setPhoneError(copy.phoneInvalid);
      return;
    }
    setSubmitError('');
    setIsSubmitting(true);
    let orderNumber = '';

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
            variant_id: i.variant_id,
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
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (typeof data?.order_number !== 'string' || !data.order_number) {
        throw new Error('Сервер не вернул номер заказа');
      }
      orderNumber = data.order_number;
    } catch (error) {
      console.error('[Order Checkout Error]', error);
      setSubmitError(copy.orderFailed);
      return;
    } finally {
      setIsSubmitting(false);
    }
    setShowPreOrderModal(false);

    const itemsText = items.map((item, index) => {
      const lineTotal = item.price_tjs * item.quantity;
      const options = [item.color, item.size].filter(
        (value) => value
          && value !== copy.standard
          && value !== copy.oneSize
          && value !== 'Стандарт'
          && value !== 'Standard'
          && value !== 'One Size',
      );
      return `${index + 1}. ${item.title}${options.length ? ` (${options.join(' / ')})` : ''} × ${item.quantity} — ${lineTotal} TJS`;
    }).join('\n\n');

    const customerDetails = [
      customerName ? `${copy.customer}: ${customerName}` : '',
      `${copy.phone}: ${customerPhone.trim()}`,
      customerAddress ? `${copy.address}: ${customerAddress}` : '',
    ].filter(Boolean).join('\n');

    const message = [
      copy.greeting,
      `${copy.orderLabel} #${orderNumber}`,
      customerDetails,
      itemsText,
      `${copy.total}: ${totalSum} TJS`,
      hasPreOrderItems ? copy.deliveryOrder : copy.deliveryStock,
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
              <ShoppingBasket className="w-5 h-5 text-emerald-700" />
              <h2 className="text-lg font-bold text-slate-900 font-heading">
                {t('cartTitle')}
              </h2>
              <span className="text-xs text-slate-500 font-mono">({items.length})</span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors"
              aria-label={t('close')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Список товаров */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {items.length === 0 ? (
              <div className="py-20 text-center text-slate-400 space-y-3">
                <ShoppingBasket className="w-12 h-12 mx-auto text-slate-200" />
                <p className="text-sm font-semibold text-slate-700">{t('cartEmpty')}</p>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">
                  {t('cartEmptyHint')}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {items.map((item) => {
                  const productVariants = products.find((product) => product.id === item.product_id)?.variants
                    || item.variants
                    || [];
                  return (
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

                      {productVariants.length > 1 && (
                        <label className="mt-2 block">
                          <span className="sr-only">{copy.chooseVariant}</span>
                          <select
                            value={item.variant_sku}
                            onChange={(event) => {
                              const variant = productVariants.find((candidate) => candidate.variant_sku === event.target.value);
                              if (variant) onAddVariant(item.id, variant);
                            }}
                            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-medium text-slate-700"
                          >
                            {productVariants.map((variant) => (
                              <option key={variant.variant_sku} value={variant.variant_sku}>
                                {[variant.color, variant.size].filter(Boolean).join(' / ')} · {variant.price_tjs} TJS
                              </option>
                            ))}
                          </select>
                          <span className="mt-1 block text-[9px] text-slate-400">{copy.addVariantHint}</span>
                        </label>
                      )}

                      {/* Параметры варианта: Цвет и Размер */}
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-1 font-medium">
                        {item.color && item.color !== 'Стандарт' && (
                          <span className="text-slate-700">{t('color')} <strong>{item.color}</strong></span>
                        )}
                        {item.color && item.color !== 'Стандарт' && item.size && item.size !== 'One Size' && (
                          <span className="text-slate-300">·</span>
                        )}
                        {item.size && item.size !== 'One Size' && (
                          <span className="text-slate-700">{t('size')} <strong>{item.size}</strong></span>
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
                  );
                })}
              </div>
            )}
          </div>

          {/* Нижний блок с подтверждением и кнопкой WhatsApp */}
          {items.length > 0 && (
            <div className="p-5 border-t border-slate-200 bg-slate-50/80 space-y-4">
              <div className="flex items-center justify-between text-base font-bold text-slate-900">
                <span>{t('totalToPay')}</span>
                <span className="text-2xl font-mono text-emerald-800">{totalSum} TJS</span>
              </div>

              {/* Авторитетный инфо-блок срока доставки */}
              <div className="p-3 bg-amber-50/90 border border-amber-200/90 rounded-xl flex items-center gap-2.5 text-xs text-slate-800 shadow-xs">
                <Truck className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  <strong>🚚 {copy.deliveryTime}</strong>{' '}
                  {hasPreOrderItems ? copy.preOrderTime : copy.stockTime}
                </span>
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
                    {language === 'ru' ? 'Я ознакомлен и согласен с ' : language === 'tg' ? 'Ман бо ' : 'I have read and agree to the '}
                    <button
                      type="button"
                      onClick={onOpenRules}
                      className="text-emerald-700 underline font-semibold hover:text-emerald-800"
                    >
                      {language === 'ru' ? 'Правилами сервиса M.Savdo' : language === 'tg' ? 'Қоидаҳои M.Savdo' : 'M.Savdo service rules'}
                    </button>
                    {language === 'ru' ? ' (включая пункт 6: возврат на карту плательщика).' : language === 'tg' ? ' (аз ҷумла банди 6: баргардонидан ба корти пардохткунанда).' : ' (including Section 6: refunds go to the original payment card).'}
                  </span>
                </label>

                {!agreedWithRules && (
                  <div className="flex items-center gap-1.5 text-[10px] text-amber-800 font-medium">
                    <ShieldAlert className="w-3 h-3 text-amber-600 shrink-0" />
                    <span>{copy.agreeRequired}</span>
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
                <span>{t('checkoutWhatsApp')}</span>
              </button>

              <div className="flex justify-between items-center text-[10px] text-slate-400">
                <span>Менеджер: +{whatsappPhone}</span>
                <button
                  onClick={onClearCart}
                  className="hover:text-red-600 transition-colors"
                >
                  {copy.clearCart}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Подтверждение срока доставки из Китая */}
      {showPreOrderModal && (
        <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border-4 border-amber-400 text-center space-y-6 animate-scale-up">
            
            <div className="w-16 h-16 bg-amber-100 border-2 border-amber-400 text-amber-600 rounded-2xl mx-auto flex items-center justify-center shadow-md">
              <Clock className="w-9 h-9" />
            </div>

            <div className="space-y-3">
              {hasPreOrderItems && (
                <>
                  <h3 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tight font-heading leading-snug">
                    {copy.deliveryTitle}
                  </h3>
                  <p className="text-base sm:text-lg font-extrabold text-amber-700">
                    {copy.deliveryQuestion}
                  </p>
                  <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
                    {copy.deliveryDescription}
                  </p>
                </>
              )}
            </div>

            {/* Быстрые контактные данные покупателя */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-left space-y-2.5">
              <label className="block text-[11px] font-bold text-slate-700">
                {copy.detailsLabel}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder={copy.namePlaceholder}
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full text-xs px-3 py-2.5 bg-white border border-slate-300 rounded-xl focus:border-amber-400 focus:outline-hidden"
                />
                <input
                  type="tel"
                  required
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder={copy.phonePlaceholder}
                  value={customerPhone}
                  onChange={(e) => {
                    setCustomerPhone(e.target.value);
                    setPhoneError('');
                  }}
                  className="w-full text-xs px-3 py-2.5 bg-white border border-slate-300 rounded-xl focus:border-amber-400 focus:outline-hidden font-mono"
                />
              </div>
              <input
                type="text"
                placeholder={copy.addressPlaceholder}
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                className="w-full text-xs px-3 py-2.5 bg-white border border-slate-300 rounded-xl focus:border-amber-400 focus:outline-hidden"
              />
              {!isPhoneValid && !phoneError && (
                <p className="text-xs font-medium text-amber-700">
                  {customerPhone.trim() ? copy.phoneInvalid : copy.phoneRequired}
                </p>
              )}
              {phoneError && <p role="alert" className="text-xs font-semibold text-red-600">{phoneError}</p>}
              {submitError && <p role="alert" className="text-xs font-semibold text-red-600">{submitError}</p>}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowPreOrderModal(false)}
                className="w-full sm:w-1/3 py-3.5 px-4 rounded-xl font-bold text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                {copy.cancel}
              </button>
              <button
                type="button"
                disabled={isSubmitting || !isPhoneValid}
                onClick={executeCheckout}
                className="w-full sm:w-2/3 py-3.5 px-6 rounded-xl font-black text-sm uppercase tracking-wider text-black bg-amber-400 hover:bg-amber-300 transition-all shadow-lg hover:shadow-amber-400/50 cursor-pointer flex items-center justify-center gap-2"
              >
                {isSubmitting ? copy.submitting : `✓ ${copy.confirm}`}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
