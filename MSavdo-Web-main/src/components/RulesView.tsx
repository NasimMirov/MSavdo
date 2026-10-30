import React from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, ShieldCheck, ShoppingBag } from 'lucide-react';

interface RulesViewProps {
  onBack: () => void;
  onOpenCart?: () => void;
}

export const RulesView: React.FC<RulesViewProps> = ({ onBack, onOpenCart }) => {
  return (
    <div className="max-w-4xl mx-auto py-4">
      <div className="mb-6 flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-emerald-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Вернуться в каталог</span>
        </button>

        {onOpenCart && (
          <button
            onClick={onOpenCart}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-emerald-50 text-emerald-700 font-semibold rounded-lg text-xs hover:bg-emerald-100 transition-colors"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Перейти в корзину</span>
          </button>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-10 shadow-sm space-y-8">
        {/* Заголовок */}
        <div className="border-b border-slate-200 pb-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-700 mb-1">
            <ShieldCheck className="w-4 h-4" />
            <span>Официальный регламент</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight font-heading">
            ПРАВИЛА ПОКУПКИ И ИСПОЛЬЗОВАНИЯ СЕРВИСА M.SAVDO
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-mono-num">
            Версия 1.1 · Редакция от 2026 года · Для клиентов сервиса в Республике Таджикистан
          </p>
        </div>

        {/* ЖЕСТКИЙ АКЦЕНТИРОВАННЫЙ БЛОК ПУНКТА 6 О ВОЗВРАТАХ СРЕДСТВ */}
        <div className="p-6 bg-red-50 border-2 border-red-400 rounded-2xl shadow-sm text-red-950">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-red-100 rounded-xl text-red-600 shrink-0 mt-0.5">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <span className="text-xs font-mono font-bold tracking-wider text-red-700 uppercase bg-red-100 px-2 py-0.5 rounded">
                Особо важный пункт регламента
              </span>
              <h2 className="text-lg sm:text-xl font-extrabold text-red-900 font-heading">
                ПУНКТ 6. РЕГЛАМЕНТ И УСЛОВИЯ ВОЗВРАТА ДЕНЕЖНЫХ СРЕДСТВ
              </h2>
              <div className="text-sm font-bold text-red-900 leading-relaxed">
                ВНИМАНИЕ! Согласно правилам сервиса M.Savdo и требованиям финансового мониторинга, в случае невозможности поставки товара (отсутствие у фабрики-производителя, выявление производственного брака при контроле качества, отмена заказа) возврат денежных средств осуществляется <span className="underline decoration-red-600 decoration-2">СТРОГО на тот же банковский счет или банковскую карту</span>, с которой была произведена исходная оплата клиентом!
              </div>
              <ul className="text-xs text-red-800 space-y-1.5 list-disc pl-5 pt-1">
                <li>Перевод средств на реквизиты третьих лиц, сторонние номера или электронные кошельки категорически <strong>запрещен</strong>.</li>
                <li>Выдача наличных средств в пунктах выдачи в счет возврата безналичных платежей не производится.</li>
                <li>Срок зачисления зависит от банка-эмитента карты клиента (обычно от 1 до 5 рабочих банковских дней).</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Остальные пункты правил без упоминания маркетплейсов и юаней */}
        <div className="space-y-6 text-sm text-slate-700 leading-relaxed">
          <section className="space-y-2">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span className="text-emerald-600 font-mono">01.</span>
              <span>Общие положения и статус сервиса</span>
            </h3>
            <p>
              1.1. Платформа «M.Savdo» оказывает услуги по поиску, международной логистике, контролю качества и адресной доставке премиальных товаров от сертифицированных производителей в Республику Таджикистан.
            </p>
            <p>
              1.2. Оформление заявки на сайте и переход к диалогу в WhatsApp со сформированной спецификацией заказа подтверждает полное согласие Заказчика с настоящими Правилами (публичной офертой).
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span className="text-emerald-600 font-mono">02.</span>
              <span>Прозрачное ценообразование в сомони (TJS)</span>
            </h3>
            <p>
              2.1. Все цены на сайте M.Savdo указаны строго в национальной валюте — таджикских сомони (TJS) и являются окончательными для оформления заказа.
            </p>
            <p>
              2.2. В стоимость товара включены: стоимость фабричного изделия, страхование отправления, таможенное оформление и взвешенная логистика до пункта выдачи в Таджикистане.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span className="text-emerald-600 font-mono">03.</span>
              <span>Сроки обработки и доставки</span>
            </h3>
            <p>
              3.1. Заказ направляется на фабрику в производство или отгрузку в течение 24 часов после подтверждения спецификации в WhatsApp.
            </p>
            <p>
              3.2. Доставка с международного распределительного центра до пунктов выдачи в Таджикистане (Душанбе, Худжанд и другие города) занимает от 12 до 20 календарных дней в штатном режиме.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span className="text-emerald-600 font-mono">04.</span>
              <span>Многоступенчатый контроль качества</span>
            </h3>
            <p>
              4.1. Каждый поступивший на международный терминал товар проходит проверку: сверка уникального артикула (SKU), визуальное соответствие выбранному цвету и размеру, целостность упаковки и отсутствие дефектов.
            </p>
            <p>
              4.2. В случае выявления любого дефекта на стадии терминальной проверки товар незамедлительно заменяется на фабрике либо клиенту возвращаются 100% средств согласно Пункту 6.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span className="text-emerald-600 font-mono">05.</span>
              <span>Оформление заказа через WhatsApp</span>
            </h3>
            <p>
              5.1. Для исключения ошибок заказ формируется с точными артикулами SKU (например, <code className="bg-slate-100 text-slate-800 px-1 py-0.5 rounded font-mono text-xs">MS-XXXXXX</code>), указанием цвета, размера и итоговой суммы в сомони (TJS).
            </p>
            <p>
              5.2. Клиент подтверждает согласие с регламентом обязательным чекбоксом перед отправкой сообщения персональному менеджеру.
            </p>
          </section>
        </div>

        {/* Подтверждение */}
        <div className="pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Правила обязательны для всех пользователей сервиса M.Savdo</span>
          </div>

          <button
            onClick={onBack}
            className="w-full sm:w-auto px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl transition-colors shadow-sm"
          >
            Понятно, перейти к товарам
          </button>
        </div>
      </div>
    </div>
  );
};
