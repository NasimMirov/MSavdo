import React from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, ShieldCheck, ShoppingBasket } from 'lucide-react';
import { useI18n } from '../i18n';

interface RulesViewProps {
  onBack: () => void;
  onOpenCart?: () => void;
}

const rulesCopy = {
  ru: {
    label: 'Официальный регламент',
    title: 'ПРАВИЛА ПОКУПКИ И ИСПОЛЬЗОВАНИЯ СЕРВИСА M.SAVDO',
    edition: 'Версия 1.1 · Редакция от 2026 года · Для клиентов в Республике Таджикистан',
    important: 'Особо важный пункт регламента',
    refundTitle: 'ПУНКТ 6. ВОЗВРАТ ДЕНЕЖНЫХ СРЕДСТВ',
    refundIntro: 'Если поставка товара невозможна из-за его отсутствия у производителя, выявленного брака или отмены заказа, возврат производится строго на тот же банковский счёт или карту, с которых клиент оплатил заказ.',
    refundItems: [
      'Перевод на реквизиты третьих лиц, сторонние номера и электронные кошельки запрещён.',
      'Наличные в пункте выдачи в счёт возврата безналичной оплаты не выдаются.',
      'Срок зачисления зависит от банка и обычно составляет от 1 до 5 рабочих банковских дней.',
    ],
    sections: [
      {
        title: 'Общие положения и статус сервиса',
        paragraphs: [
          '1.1. Платформа M.Savdo оказывает услуги по поиску товаров, международной логистике, контролю качества и доставке в Республику Таджикистан.',
          '1.2. Оформление заявки на сайте и переход к диалогу в WhatsApp со спецификацией заказа означает согласие Заказчика с настоящими Правилами (публичной офертой).',
        ],
      },
      {
        title: 'Прозрачное ценообразование в сомони (TJS)',
        paragraphs: [
          '2.1. Все цены на сайте указаны в таджикских сомони (TJS) и являются окончательными для оформления заказа.',
          '2.2. В стоимость включены товар, страхование отправления, таможенное оформление и логистика до пункта выдачи в Таджикистане.',
        ],
      },
      {
        title: 'Сроки обработки и доставки',
        paragraphs: [
          '3.1. Заказ направляется производителю для производства или отгрузки в течение 24 часов после подтверждения спецификации в WhatsApp.',
          '3.2. Ориентировочный срок доставки — от 12 до 35 календарных дней. В редких случаях возможны задержки по причинам, не зависящим от M.Savdo.',
          '3.3. Перевозку товара из Китая до пункта приёма M.Savdo выполняют сотрудничающие с сервисом карго-компании, отвечающие за этот участок доставки.',
        ],
      },
      {
        title: 'Контроль качества',
        paragraphs: [
          '4.1. На международном терминале проверяются артикул (SKU), соответствие выбранным цвету и размеру, целостность упаковки и отсутствие видимых дефектов.',
          '4.2. Если при проверке выявлен дефект, товар заменяется у производителя либо клиенту возвращаются средства согласно пункту 6.',
        ],
      },
      {
        title: 'Оформление заказа через WhatsApp',
        paragraphs: [
          '5.1. Заказ формируется с указанием артикула SKU, цвета, размера и итоговой суммы в сомони (TJS).',
          '5.2. Перед отправкой заказа персональному менеджеру клиент подтверждает согласие с Правилами.',
        ],
      },
    ],
    confirmation: 'Правила обязательны для всех пользователей сервиса M.Savdo',
    button: 'Понятно, перейти к товарам',
  },
  tg: {
    label: 'Қоидаҳои расмӣ',
    title: 'ҚОИДАҲОИ ХАРИД ВА ИСТИФОДАИ ХИЗМАТРАСОНИИ M.SAVDO',
    edition: 'Нусхаи 1.1 · Таҳрири соли 2026 · Барои муштариёни Ҷумҳурии Тоҷикистон',
    important: 'Қоидаи махсусан муҳим',
    refundTitle: 'БАНДИ 6. БАРГАРДОНИДАНИ МАБЛАҒ',
    refundIntro: 'Агар мол дастрас набошад, нуқсони истеҳсолӣ ошкор шавад ё фармоиш бекор гардад, маблағ танҳо ба ҳамон суратҳисоби бонкӣ ё корте баргардонида мешавад, ки муштарӣ аз он пардохт кардааст.',
    refundItems: [
      'Интиқол ба суратҳисоб ё рақами шахсони дигар ва ҳамёнҳои электронӣ манъ аст.',
      'Ба ивази пардохти ғайринақдӣ дар нуқтаи қабул пули нақд дода намешавад.',
      'Муҳлати воридшавӣ аз бонк вобаста буда, одатан аз 1 то 5 рӯзи кории бонкиро ташкил медиҳад.',
    ],
    sections: [
      {
        title: 'Муқаррароти умумӣ ва мақоми хизматрасонӣ',
        paragraphs: [
          '1.1. Платформаи M.Savdo ҷустуҷӯи мол, логистикаи байналмилалӣ, санҷиши сифат ва расонидани молро ба Ҷумҳурии Тоҷикистон таъмин мекунад.',
          '1.2. Сабти дархост дар сомона ва гузаштан ба муколамаи WhatsApp бо мушаххасоти фармоиш маънои розигии Фармоишгарро ба ин Қоидаҳо (офертаи оммавӣ) дорад.',
        ],
      },
      {
        title: 'Нархгузории шаффоф бо сомонӣ (TJS)',
        paragraphs: [
          '2.1. Ҳамаи нархҳои сомона бо сомонии Тоҷикистон (TJS) нишон дода шуда, барои сабти фармоиш ниҳоӣ мебошанд.',
          '2.2. Ба нарх арзиши мол, суғуртаи ирсол, барасмиятдарории гумрукӣ ва логистика то нуқтаи қабул дар Тоҷикистон дохиланд.',
        ],
      },
      {
        title: 'Муҳлати коркард ва расонидан',
        paragraphs: [
          '3.1. Дар давоми 24 соат пас аз тасдиқи мушаххасоти фармоиш дар WhatsApp, фармоиш барои истеҳсол ё фиристодан ба истеҳсолкунанда равона мешавад.',
          '3.2. Муҳлати тахминии расонидан аз 12 то 35 рӯзи тақвимӣ аст. Дар ҳолатҳои кам бинобар сабабҳои ба M.Savdo вобаста набуда таъхир имкон дорад.',
          '3.3. Интиқоли мол аз Чин то нуқтаи қабули M.Savdo аз ҷониби ширкатҳои каргои ҳамкор анҷом дода шуда, онҳо барои ин қитъаи роҳ масъуланд.',
        ],
      },
      {
        title: 'Назорати сифат',
        paragraphs: [
          '4.1. Дар терминали байналмилалӣ рамзи мол (SKU), мувофиқати ранг ва андозаи интихобшуда, бутунии бастабандӣ ва набудани нуқсонҳои намоён санҷида мешаванд.',
          '4.2. Ҳангоми ошкор шудани нуқсон мол аз истеҳсолкунанда иваз карда мешавад ё маблағ тибқи банди 6 баргардонида мешавад.',
        ],
      },
      {
        title: 'Сабти фармоиш тавассути WhatsApp',
        paragraphs: [
          '5.1. Дар фармоиш рамзи SKU, ранг, андоза ва маблағи ниҳоӣ бо сомонӣ (TJS) нишон дода мешаванд.',
          '5.2. Пеш аз фиристодани фармоиш ба менеҷери шахсӣ муштарӣ розигии худро ба Қоидаҳо тасдиқ мекунад.',
        ],
      },
    ],
    confirmation: 'Қоидаҳо барои ҳамаи истифодабарандагони M.Savdo ҳатмӣ мебошанд',
    button: 'Фаҳмо, ба молҳо гузаштан',
  },
  en: {
    label: 'Official service rules',
    title: 'M.SAVDO PURCHASE AND SERVICE TERMS',
    edition: 'Version 1.1 · 2026 edition · For customers in the Republic of Tajikistan',
    important: 'Important service term',
    refundTitle: 'SECTION 6. REFUNDS',
    refundIntro: 'If an item cannot be supplied because it is unavailable from the manufacturer, has a detected defect, or the order is cancelled, the refund is issued only to the same bank account or card used by the customer for the original payment.',
    refundItems: [
      'Refunds to third-party details, other phone numbers, or electronic wallets are prohibited.',
      'Cash refunds for non-cash payments are not issued at collection points.',
      'Posting time depends on the issuing bank and is usually 1–5 banking business days.',
    ],
    sections: [
      {
        title: 'General terms and service status',
        paragraphs: [
          '1.1. M.Savdo provides product sourcing, international logistics, quality inspection, and delivery to the Republic of Tajikistan.',
          '1.2. Submitting a request on the website and proceeding to WhatsApp with the order specification means the customer accepts these Terms (public offer).',
        ],
      },
      {
        title: 'Transparent pricing in somoni (TJS)',
        paragraphs: [
          '2.1. All prices on the website are shown in Tajikistani somoni (TJS) and are final for placing an order.',
          '2.2. The price includes the item, shipment insurance, customs clearance, and logistics to a collection point in Tajikistan.',
        ],
      },
      {
        title: 'Processing and delivery times',
        paragraphs: [
          '3.1. Within 24 hours after the specification is confirmed on WhatsApp, the order is sent to the manufacturer for production or dispatch.',
          '3.2. The estimated delivery time is 12–35 calendar days. In rare cases, delays may occur for reasons beyond M.Savdo’s control.',
          '3.3. Cargo companies working with the service transport items from China to the M.Savdo receiving point and are responsible for that part of delivery.',
        ],
      },
      {
        title: 'Quality inspection',
        paragraphs: [
          '4.1. At the international terminal, the SKU, selected color and size, package integrity, and visible defects are checked.',
          '4.2. If an issue is found during inspection, the item is replaced by the manufacturer or the customer is refunded under Section 6.',
        ],
      },
      {
        title: 'Placing an order through WhatsApp',
        paragraphs: [
          '5.1. An order includes the SKU, color, size, and final amount in somoni (TJS).',
          '5.2. Before sending the order to a personal manager, the customer confirms acceptance of these Terms.',
        ],
      },
    ],
    confirmation: 'These rules apply to all M.Savdo service users',
    button: 'Got it, show products',
  },
} as const;

export const RulesView: React.FC<RulesViewProps> = ({ onBack, onOpenCart }) => {
  const { t, language } = useI18n();
  const copy = rulesCopy[language];

  return (
    <div className="mx-auto max-w-4xl py-4">
      <div className="mb-5 flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition-colors hover:text-emerald-700"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{t('backToCatalog')}</span>
        </button>
        {onOpenCart && (
          <button
            onClick={onOpenCart}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3.5 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
          >
            <ShoppingBasket className="h-4 w-4" />
            <span>{t('goToCart')}</span>
          </button>
        )}
      </div>

      <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <header className="border-b border-slate-200 pb-4">
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-700">
            <ShieldCheck className="h-4 w-4" />
            <span>{copy.label}</span>
          </div>
          <h1 className="font-heading text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
            {copy.title}
          </h1>
          <p className="mt-1 text-xs text-slate-500">{copy.edition}</p>
        </header>

        <section className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-950 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0 rounded-lg bg-red-100 p-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <span className="rounded bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-700">
                {copy.important}
              </span>
              <h2 className="font-heading text-base font-extrabold text-red-900 sm:text-lg">{copy.refundTitle}</h2>
              <p className="text-sm font-semibold leading-relaxed">{copy.refundIntro}</p>
              <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-red-800">
                {copy.refundItems.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          </div>
        </section>

        <div className="space-y-5 text-sm leading-relaxed text-slate-700">
          {copy.sections.map((section, index) => (
            <section key={section.title} className="space-y-2">
              <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
                <span className="font-mono text-emerald-600">{String(index + 1).padStart(2, '0')}.</span>
                <span>{section.title}</span>
              </h3>
              {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </section>
          ))}
        </div>

        <footer className="flex flex-col items-center justify-between gap-4 border-t border-slate-200 pt-5 sm:flex-row">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>{copy.confirmation}</span>
          </div>
          <button
            onClick={onBack}
            className="w-full rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 sm:w-auto"
          >
            {copy.button}
          </button>
        </footer>
      </div>
    </div>
  );
};
