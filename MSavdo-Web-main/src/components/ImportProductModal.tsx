import React, { useState, useRef } from 'react';
import { apiFetch } from '../api';
import {
  X, Sparkles, Link as LinkIcon, Clipboard, Check, AlertCircle,
  ArrowRight, Package, Code2, Upload, FileCode, CheckCircle2,
  Eye, RefreshCw, Layers, ShieldCheck, Zap
} from 'lucide-react';

interface ImportProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ImportProductModal: React.FC<ImportProductModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'html' | 'link' | 'json'>('html');
  const [htmlCode, setHtmlCode] = useState('');
  const [productLink, setProductLink] = useState('');
  const [jsonText, setJsonText] = useState('');
  const [basePriceCny, setBasePriceCny] = useState<string>('35');
  const [weightKg, setWeightKg] = useState<string>('0.5');
  const [deliveryType, setDeliveryType] = useState<'order' | 'stock'>('order');
  const [autoSave, setAutoSave] = useState(true);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [parsedPreview, setParsedPreview] = useState<any | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Демо-примеры HTML и window.context для моментального тестирования
  const samplePresets = [
    {
      id: 'paper_a4',
      name: '📄 Офисная бумага A4 70г/80г (500 листов)',
      desc: 'Проверка правила 1: Строго офисная бумага, никаких чернил или принтерных красок!',
      link: 'https://detail.1688.com/offer/712398456123.html',
      cny: '14.50',
      weight: '2.4',
      code: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>A4复印纸 70g 80g 500张/包 打印纸 办公用纸 全木浆双胶草稿纸整箱批发</title>
  <meta property="og:title" content="A4复印纸 70g 80g 500张/包 打印纸 办公用纸 全木浆双胶纸">
</head>
<body>
  <div class="product-info">
    <h1 class="d-title">A4复印纸 70g 80g 500张/包 打印纸 办公用纸 全木浆双胶纸</h1>
  </div>

  <!-- Таблица характеристик (featureAttributes) -->
  <div class="od-pc-attribute">
    <div class="od-pc-attribute-item"><span>克重：</span><span>70g / 80g</span></div>
    <div class="od-pc-attribute-item"><span>纸张规格：</span><span>A4 (210mm × 297mm)</span></div>
    <div class="od-pc-attribute-item"><span>包装规格：</span><span>500张/包 (整箱5包/2500张)</span></div>
    <div class="od-pc-attribute-item"><span>材质成分：</span><span>100%全木浆原纸 (无氯漂白)</span></div>
    <div class="od-pc-attribute-item"><span>白度(CIE)：</span><span>102% (CIE 160%高白高对比度)</span></div>
    <div class="od-pc-attribute-item"><span>适用机型：</span><span>激光打印机、喷墨打印机、数码复印机、普通传真机</span></div>
    <div class="od-pc-attribute-item"><span>纸张厚度：</span><span>104-106um</span></div>
    <div class="od-pc-attribute-item"><span>双面打印：</span><span>支持高抗透双面高速打印</span></div>
    <div class="od-pc-attribute-item"><span>产地：</span><span>中国江苏工厂</span></div>
  </div>

  <script>
    window.context = {
      "data": {
        "title": "A4复印纸 70g 80g 500张/包 打印纸 办公用纸 全木浆打印机纸",
        "featureAttributes": [
          { "name": "克重", "value": "70g / 80g" },
          { "name": "纸张规格", "value": "A4 (210*297mm)" },
          { "name": "包装规格", "value": "500张/包" },
          { "name": "材质", "value": "100%原生木浆" },
          { "name": "白度", "value": "102%" },
          { "name": "适用机型", "value": "激光打印机、喷墨打印机、复印机" },
          { "name": "产地", "value": "中国" }
        ],
        "skuInfoMap": {
          "70g A4 单包 (500张)": { "price": "14.50", "canBookCount": 8500, "skuId": "9101" },
          "80g A4 单包 (500张)": { "price": "16.80", "canBookCount": 6200, "skuId": "9102" },
          "70g A4 整箱5包 (2500张)": { "price": "69.00", "canBookCount": 3100, "skuId": "9103" },
          "80g A4 整箱5包 (2500张)": { "price": "79.00", "canBookCount": 2400, "skuId": "9104" }
        },
        "shippingInfo": { "unitWeight": 2.45 },
        "images": [
          "https://images.unsplash.com/photo-1586075010923-2dd4570fb338?w=800",
          "https://images.unsplash.com/photo-1589829085413-56de8ae18c73?w=800"
        ]
      }
    };
  </script>
</body>
</html>`
    },
    {
      id: 'shoes_work',
      name: '👟 Мужские рабочие туфли из экокожи (39-44)',
      desc: 'Проверка правила 2: Соответствие размеров и цен из skuInfoMap',
      link: 'https://detail.1688.com/offer/923047260456.html',
      cny: '9.50',
      weight: '0.75',
      code: `<!DOCTYPE html>
<html>
<head>
  <title>2026新款透气防滑耐磨劳保皮鞋男工作鞋厚底休闲皮鞋</title>
</head>
<body>
  <div class="od-pc-attribute">
    <div class="od-pc-attribute-item"><span>鞋面材质：</span><span>透气超纤皮</span></div>
    <div class="od-pc-attribute-item"><span>鞋底材质：</span><span>加厚防滑橡胶大底</span></div>
    <div class="od-pc-attribute-item"><span>适用季节：</span><span>四季通用</span></div>
    <div class="od-pc-attribute-item"><span>闭合方式：</span><span>系带</span></div>
    <div class="od-pc-attribute-item"><span>功能：</span><span>防滑、减震、耐磨、防臭</span></div>
  </div>
  <script>
    window.context = {
      "data": {
        "title": "男士透气防滑耐磨厚底劳保皮鞋工作鞋",
        "featureAttributes": [
          { "name": "鞋面材质", "value": "透气超纤皮" },
          { "name": "鞋底材质", "value": "加厚防滑实心橡胶底" },
          { "name": "适用季节", "value": "四季春秋" },
          { "name": "功能", "value": "防滑耐磨减震" }
        ],
        "skuInfoMap": {
          "黑色 39": { "price": "9.50", "canBookCount": 540, "skuId": "8001" },
          "黑色 40": { "price": "9.50", "canBookCount": 680, "skuId": "8002" },
          "黑色 41": { "price": "9.50", "canBookCount": 710, "skuId": "8003" },
          "黑色 42": { "price": "9.50", "canBookCount": 820, "skuId": "8004" },
          "咖色 41": { "price": "9.50", "canBookCount": 430, "skuId": "8005" },
          "咖色 42": { "price": "9.50", "canBookCount": 500, "skuId": "8006" }
        },
        "shippingInfo": { "unitWeight": 0.75 },
        "images": [
          "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800",
          "https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=800"
        ]
      }
    };
  </script>
</body>
</html>`
    },
    {
      id: 'ink_epson',
      name: '🖨️ Чернила Epson 004 (L3169 / L3108)',
      desc: 'Расходные материалы для струйных принтеров: 70 мл / 127 мл',
      link: 'https://detail.1688.com/offer/798257023213.html',
      cny: '3.39',
      weight: '0.15',
      code: `<!DOCTYPE html>
<html>
<head>
  <title>适用爱普生004墨水瓶 L3169 L3108 L3115 L3118 打印机连供墨水</title>
</head>
<body>
  <script>
    window.context = {
      "data": {
        "title": "适用爱普生004墨水瓶 L3169 L3108 L3115 L3118 打印机连供墨水",
        "featureAttributes": [
          { "name": "适用品牌", "value": "爱普生 Epson" },
          { "name": "适用机型", "value": "L3108 / L3115 / L3118 / L3158 / L3168 / L1118" },
          { "name": "墨水类型", "value": "染料墨水 (Dye) / 颜料墨水" },
          { "name": "容量", "value": "70ml / 127ml" }
        ],
        "skuInfoMap": {
          "黑色 70ml (Dye)": { "price": "3.39", "canBookCount": 49000, "skuId": "7001" },
          "蓝色 70ml (Cyan)": { "price": "3.39", "canBookCount": 49000, "skuId": "7002" },
          "红色 70ml (Magenta)": { "price": "3.39", "canBookCount": 49000, "skuId": "7003" },
          "黄色 70ml (Yellow)": { "price": "3.39", "canBookCount": 49000, "skuId": "7004" }
        },
        "shippingInfo": { "unitWeight": 0.12 },
        "images": [
          "https://cbu01.alicdn.com/img/ibank/O1CN016f40P622jV0Z2x8r8_!!2200742183570-0-cib.jpg"
        ]
      }
    };
  </script>
</body>
</html>`
    }
  ];

  // Вставка из буфера обмена в поле кода страницы
  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        setErrorMsg('Буфер обмена пуст');
        return;
      }
      setHtmlCode(text);
      setErrorMsg('');
      setSuccessMsg(`✓ Вставлено ${text.length} символов из буфера обмена`);
    } catch (e: any) {
      setErrorMsg('Не удалось прочитать буфер обмена. Пожалуйста, вставьте код вручную клавишами Ctrl+V');
    }
  };

  // Загрузка файла .html / .txt / .json
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string') {
        setHtmlCode(content);
        setSuccessMsg(`✓ Загружен файл «${file.name}» (${content.length} символов)`);
        setErrorMsg('');
      }
    };
    reader.onerror = () => {
      setErrorMsg('Ошибка чтения файла');
    };
    reader.readAsText(file);
  };

  // Запуск строгого ИИ-анализа переданного кода страницы
  const handleParseHtmlCode = async (saveDirectly: boolean) => {
    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    setParsedPreview(null);

    try {
      const code = htmlCode.trim();
      if (!code || code.length < 15) {
        throw new Error('Пожалуйста, вставьте исходный HTML-код страницы или объект window.context');
      }

      const res = await apiFetch('/api/parse-product-html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html_code: code,
          original_link: productLink.trim(),
          price_cny: parseFloat(basePriceCny) || 50,
          weight_kg: parseFloat(weightKg) || 0.5,
          delivery_type: deliveryType,
          save_to_catalog: saveDirectly,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Ошибка анализа страницы');
      }

      if (saveDirectly && data.saved) {
        setSuccessMsg(`✓ Товар «${data.product.title}» успешно проанализирован по всем 3 правилам и добавлен в каталог M.Savdo!`);
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1800);
      } else {
        setParsedPreview(data.product);
        setSuccessMsg('✓ Данные страницы успешно извлечены ИИ строго по целевому товару без галлюцинаций!');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Сбой при анализе кода страницы');
    } finally {
      setIsLoading(false);
    }
  };

  // Сохранение из предпросмотра
  const handleConfirmSavePreview = async () => {
    if (!parsedPreview) return;
    setIsLoading(true);
    setErrorMsg('');

    try {
      const res = await apiFetch('/api/add-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: parsedPreview.title,
          description: parsedPreview.description,
          category_name: parsedPreview.category_name,
          weight_kg: parsedPreview.weight_kg,
          specifications: parsedPreview.specifications,
          variants: parsedPreview.variants,
          images: parsedPreview.images?.join(',') || '',
          original_link: productLink.trim() || parsedPreview.original_link || '',
          delivery_type: deliveryType,
          status: 'active',
        }),
      });

      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setSuccessMsg(`✓ Товар «${data.product?.title || parsedPreview.title}» сохранен в витрину!`);
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1600);
      } else {
        throw new Error(data.message || data.error || 'Ошибка сохранения');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Ошибка сохранения');
    } finally {
      setIsLoading(false);
    }
  };

  // Детекторы содержимого в реальном времени
  const hasWindowContext = htmlCode.includes('window.context') || htmlCode.includes('__INIT_DATA');
  const hasSkuMap = htmlCode.includes('skuInfoMap') || htmlCode.includes('skuMap');
  const hasFeatures = htmlCode.includes('featureAttributes') || htmlCode.includes('productAttributes') || htmlCode.includes('od-pc-attribute');
  const hasHtml = htmlCode.includes('<html') || htmlCode.includes('<div') || htmlCode.includes('<script');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/75 backdrop-blur-md animate-fade-in">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] overflow-hidden shadow-2xl border border-slate-200 flex flex-col">
        
        {/* Шапка */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-slate-900 to-black text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-400 text-black flex items-center justify-center font-black shadow-lg shadow-amber-400/20">
              <Code2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-white tracking-tight">
                  Анализ и импорт исходного кода страницы
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30">
                  Строгий парсер v4.0
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Анализ HTML-кода, window.context, featureAttributes и skuInfoMap строго без галлюцинаций
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Вкладки */}
        <div className="border-b border-slate-200 px-6 pt-3 flex gap-4 text-xs font-bold bg-slate-50">
          <button
            onClick={() => setActiveTab('html')}
            className={`pb-3 flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'html'
                ? 'border-amber-500 text-amber-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileCode className="w-4 h-4" />
            <span>Код страницы (HTML / window.context)</span>
            <span className="px-1.5 py-0.2 rounded-md bg-amber-100 text-amber-800 text-[10px]">Основной</span>
          </button>
          <button
            onClick={() => setActiveTab('link')}
            className={`pb-3 flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'link'
                ? 'border-amber-500 text-amber-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <LinkIcon className="w-4 h-4" />
            <span>По ссылке 1688</span>
          </button>
          <button
            onClick={() => setActiveTab('json')}
            className={`pb-3 flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'json'
                ? 'border-amber-500 text-amber-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clipboard className="w-4 h-4" />
            <span>JSON из расширения</span>
          </button>
        </div>

        {/* Тело модального окна */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs flex-1">
          
          {/* Сообщения об ошибках / успехе */}
          {errorMsg && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-red-700 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>{errorMsg}</div>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 flex items-start gap-2.5 font-semibold">
              <Check className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <div>{successMsg}</div>
            </div>
          )}

          {/* Вкладка 1: Исходный код страницы (HTML / window.context) */}
          {activeTab === 'html' && (
            <div className="space-y-4">
              
              {/* Блок правил безопасности и точности ИИ */}
              <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-2xl space-y-1.5">
                <div className="flex items-center gap-2 font-black text-amber-900 text-xs">
                  <ShieldCheck className="w-4 h-4 text-amber-600" />
                  <span>3 строгих правила анализа ИИ (Без галлюцинаций):</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px] text-amber-800 leading-snug pt-1">
                  <div className="bg-white/80 p-2 rounded-xl border border-amber-200/50">
                    <strong>1. Соответствие категории:</strong> Плотность, формат и материалы проверяются строго по целевому товару (например, офисная бумага никогда не путается с чернилами).
                  </div>
                  <div className="bg-white/80 p-2 rounded-xl border border-amber-200/50">
                    <strong>2. Точные SKU и цены:</strong> Извлечение реальных цен и складских остатков из массива <code className="text-amber-900 font-mono">skuInfoMap</code>.
                  </div>
                  <div className="bg-white/80 p-2 rounded-xl border border-amber-200/50">
                    <strong>3. Восстановление данных:</strong> При сбое сериализации парсер опирается на видимые HTML-таблицы характеристик и веса.
                  </div>
                </div>
              </div>

              {/* Панель быстрых тестовых пресетов */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  Быстрые проверочные пресеты (1 клик для вставки реального кода):
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {samplePresets.map((sp) => (
                    <button
                      key={sp.id}
                      type="button"
                      onClick={() => {
                        setHtmlCode(sp.code);
                        setProductLink(sp.link);
                        setBasePriceCny(sp.cny);
                        setWeightKg(sp.weight);
                        setErrorMsg('');
                        setSuccessMsg(`✓ Загружен тестовый код: ${sp.name}`);
                      }}
                      className="text-left p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-amber-50 hover:border-amber-300 transition-all group"
                    >
                      <div className="font-bold text-slate-900 group-hover:text-amber-800">
                        {sp.name}
                      </div>
                      <div className="text-[10px] text-slate-500 line-clamp-2 mt-0.5">
                        {sp.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Поле для вставки HTML-кода */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-900 flex items-center gap-1.5">
                    <span>Исходный HTML-код страницы или структура window.context:</span>
                    <span className="text-slate-400 font-normal">({htmlCode.length} символов)</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handlePasteClipboard}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold flex items-center gap-1 transition-colors"
                    >
                      <Clipboard className="w-3.5 h-3.5" />
                      <span>Вставить из буфера</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold flex items-center gap-1 transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Файл .html / .txt</span>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".html,.htm,.txt,.json"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    {htmlCode && (
                      <button
                        type="button"
                        onClick={() => { setHtmlCode(''); setParsedPreview(null); }}
                        className="px-2 py-1 text-slate-400 hover:text-red-600 rounded-lg transition-colors"
                      >
                        Очистить
                      </button>
                    )}
                  </div>
                </div>

                <div className="relative">
                  <textarea
                    value={htmlCode}
                    onChange={(e) => setHtmlCode(e.target.value)}
                    rows={11}
                    placeholder={`Вставьте сюда:\n1. Исходный HTML-код страницы целиком (Ctrl+U -> Ctrl+A -> Ctrl+C на 1688 / Taobao / Pinduoduo)\n2. Либо блок <script> с window.context = { "data": { ... } };\n3. Либо массив featureAttributes и skuInfoMap...`}
                    className="w-full p-3 font-mono text-[11px] leading-relaxed border border-slate-300 rounded-2xl focus:ring-2 focus:ring-amber-500 focus:outline-none bg-slate-950 text-emerald-400 placeholder-slate-500"
                  />
                  
                  {/* Статус-панель детекторов */}
                  <div className="absolute bottom-2.5 right-3 flex items-center gap-1.5">
                    {hasWindowContext && (
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono font-bold">
                        ✓ window.context
                      </span>
                    )}
                    {hasSkuMap && (
                      <span className="px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px] font-mono font-bold">
                        ✓ skuInfoMap
                      </span>
                    )}
                    {hasFeatures && (
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-bold">
                        ✓ Характеристики
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Дополнительные параметры (ссылка, цена, вес) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Оригинальная ссылка (для сохранения):
                  </label>
                  <input
                    type="text"
                    value={productLink}
                    onChange={(e) => setProductLink(e.target.value)}
                    placeholder="https://detail.1688.com/offer/..."
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-xl font-mono text-[11px] focus:ring-1 focus:ring-amber-500 focus:outline-none bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Базовая цена CNY (если не указана в SKU):
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={basePriceCny}
                    onChange={(e) => setBasePriceCny(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-xl font-mono text-[11px] focus:ring-1 focus:ring-amber-500 focus:outline-none bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Вес единицы (кг):
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    value={weightKg}
                    onChange={(e) => setWeightKg(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-xl font-mono text-[11px] focus:ring-1 focus:ring-amber-500 focus:outline-none bg-white"
                  />
                </div>
              </div>

              {/* Кнопки запуска анализа */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoSave}
                    onChange={(e) => setAutoSave(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400 border-slate-300"
                  />
                  <span className="font-bold text-slate-700 text-xs">
                    Сразу сохранять в каталог M.Savdo (1 клик)
                  </span>
                </label>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => handleParseHtmlCode(false)}
                    disabled={isLoading || !htmlCode}
                    className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl transition-all disabled:opacity-40 flex items-center justify-center gap-1.5"
                  >
                    <Eye className="w-4 h-4 text-slate-600" />
                    <span>Предпросмотр</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleParseHtmlCode(autoSave)}
                    disabled={isLoading || !htmlCode}
                    className="flex-1 sm:flex-none px-6 py-2.5 bg-amber-400 hover:bg-amber-500 text-black font-black rounded-xl transition-all shadow-lg shadow-amber-400/20 disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    <Zap className="w-4 h-4 fill-black" />
                    <span>{isLoading ? 'Анализ Gemini...' : autoSave ? '⚡ ИИ-анализ и импорт' : 'Строгий анализ ИИ'}</span>
                  </button>
                </div>
              </div>

              {/* Блок предпросмотра результата */}
              {parsedPreview && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <div className="font-black text-slate-900 text-sm flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Результат строгого анализа целевого товара:</span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                      {parsedPreview.category_name}
                    </span>
                  </div>

                  <div>
                    <div className="text-xs font-black text-slate-900">
                      {parsedPreview.title}
                    </div>
                    <div className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                      {parsedPreview.description}
                    </div>
                  </div>

                  {/* Характеристики */}
                  {parsedPreview.specifications && parsedPreview.specifications.length > 0 && (
                    <div className="space-y-1 pt-1">
                      <div className="font-bold text-slate-800 text-[11px]">
                        Извлеченные характеристики ({parsedPreview.specifications.length} шт.):
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                        {parsedPreview.specifications.slice(0, 9).map((s: any, idx: number) => (
                          <div key={idx} className="p-1.5 bg-white rounded-lg border border-slate-200 text-[10px]">
                            <span className="text-slate-500">{s.name}:</span>{' '}
                            <span className="font-bold text-slate-900">{s.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Варианты */}
                  {parsedPreview.variants && parsedPreview.variants.length > 0 && (
                    <div className="space-y-1 pt-1">
                      <div className="font-bold text-slate-800 text-[11px]">
                        Модификации SKU из skuInfoMap ({parsedPreview.variants.length} шт.):
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {parsedPreview.variants.slice(0, 8).map((v: any, idx: number) => (
                          <span key={idx} className="px-2 py-1 bg-white border border-slate-200 rounded-md text-[10px] font-mono">
                            <strong>{v.color}</strong> ({v.size}) — ¥{v.price_cny} | Склад: {v.stock}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleConfirmSavePreview}
                    disabled={isLoading}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>Подтвердить и добавить в каталог M.Savdo</span>
                  </button>
                </div>
              )}

            </div>
          )}

          {/* Вкладка 2: По ссылке */}
          {activeTab === 'link' && (
            <div className="space-y-4">
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  Вставьте ссылку на товар с 1688.com или Pinduoduo:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={productLink}
                    onChange={(e) => setProductLink(e.target.value)}
                    placeholder="https://detail.1688.com/offer/798257023213.html"
                    className="flex-1 px-3.5 py-2.5 border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                  <button
                    onClick={() => handleParseHtmlCode(true)}
                    disabled={isLoading || !productLink}
                    className="px-5 py-2.5 bg-amber-400 hover:bg-amber-500 text-black font-black rounded-xl transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <span>{isLoading ? 'Импорт...' : 'Импортировать'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Вкладка 3: JSON из расширения */}
          {activeTab === 'json' && (
            <div className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  Вставьте JSON, скопированный по кнопке «📋 Скопировать JSON» в расширении:
                </label>
                <textarea
                  value={jsonText}
                  onChange={(e) => setJsonText(e.target.value)}
                  rows={8}
                  placeholder={`{\n  "title": "A4复印纸 70g",\n  "price_cny": 14.50,\n  "specifications": [...],\n  "variants": [...]\n}`}
                  className="w-full p-3 font-mono text-[11px] border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none bg-slate-950 text-slate-100"
                />
              </div>
              <button
                onClick={() => {
                  setHtmlCode(jsonText);
                  handleParseHtmlCode(true);
                }}
                disabled={isLoading || !jsonText}
                className="w-full py-2.5 bg-amber-400 hover:bg-amber-500 text-black font-black rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>{isLoading ? 'Сохранение товара...' : 'Импортировать в M.Savdo'}</span>
              </button>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
