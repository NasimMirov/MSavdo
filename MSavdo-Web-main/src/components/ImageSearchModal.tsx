import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Product } from '../types';
import { apiFetch } from '../api';
import {
  Camera,
  Upload,
  X,
  Sparkles,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  FlipHorizontal,
  Image as ImageIcon,
  ArrowRight,
  ShoppingBag,
  Eye,
  Truck,
  Clock,
  Layers
} from 'lucide-react';

interface ImageSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProduct: (product: Product) => void;
  onApplySearchQuery?: (query: string) => void;
}

export const ImageSearchModal: React.FC<ImageSearchModalProps> = ({
  isOpen,
  onClose,
  onSelectProduct,
  onApplySearchQuery,
}) => {
  const [activeTab, setActiveTab] = useState<'camera' | 'gallery'>('camera');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<{
    identified: {
      product_name: string;
      category_name: string;
      color: string;
      keywords: string[];
      description: string;
    };
    products: Product[];
    total_found: number;
  } | null>(null);

  // Camera state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const streamRef = useRef<MediaStream | null>(null);

  // Stop camera stream safely
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  // Start camera stream
  const startCamera = useCallback(async (mode: 'environment' | 'user') => {
    setCameraError(null);
    stopCamera();
    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err: any) {
      console.warn('[Camera Access Error]', err);
      setCameraError(
        err.name === 'NotAllowedError'
          ? 'Доступ к камере заблокирован. Разрешите доступ в браузере или используйте загрузку из галереи.'
          : 'Не удалось запустить камеру на этом устройстве. Пожалуйста, выберите фото из галереи.'
      );
      setCameraActive(false);
    }
  }, [stopCamera]);

  // Effect to manage camera when modal opens/closes or tab changes
  useEffect(() => {
    if (isOpen && activeTab === 'camera' && !selectedImage) {
      startCamera(facingMode);
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, activeTab, selectedImage, facingMode, startCamera, stopCamera]);

  // Handle capture photo from video stream
  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current || document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    stopCamera();
    setSelectedImage(dataUrl);
    performSearch(dataUrl);
  };

  // Switch between front and back camera
  const toggleFacingMode = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  // Handle file select from gallery
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setSearchError('Пожалуйста, выберите файл изображения (JPG, PNG, WEBP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setSelectedImage(dataUrl);
        performSearch(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  // Handle clipboard paste
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = (event) => {
              const dataUrl = event.target?.result as string;
              if (dataUrl) {
                stopCamera();
                setSelectedImage(dataUrl);
                performSearch(dataUrl);
              }
            };
            reader.readAsDataURL(blob);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen, stopCamera]);

  // Execute Search API call
  const performSearch = async (imageDataUrl: string) => {
    setIsSearching(true);
    setSearchError(null);
    setSearchResult(null);

    try {
      const res = await apiFetch('/api/search-by-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageDataUrl }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Ошибка сервера: HTTP ${res.status}`);
      }

      const data = await res.json();
      setSearchResult(data);
    } catch (err: any) {
      console.error('[Visual Search Error]', err);
      setSearchError(err.message || 'Не удалось выполнить визуальный поиск');
    } finally {
      setIsSearching(false);
    }
  };

  // Reset to take another photo
  const handleReset = () => {
    setSelectedImage(null);
    setSearchResult(null);
    setSearchError(null);
    if (activeTab === 'camera') {
      startCamera(facingMode);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-md animate-fade-in">
      <div
        className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] overflow-hidden shadow-2xl border border-slate-200 flex flex-col relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-black text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-400 text-black flex items-center justify-center font-black shadow-md">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black tracking-tight text-white font-heading">
                  Поиск по фото
                </h2>
                <span className="bg-amber-400 text-black text-[9px] font-black px-2 py-0.5 rounded-full uppercase">
                  ИИ Gemini
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 font-medium">
                Сделайте снимок камерой или загрузите фото из галереи
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1.5 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-800 transition-colors"
            title="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector Tabs (only shown if no image is currently captured) */}
        {!selectedImage && (
          <div className="bg-slate-50 border-b border-slate-200 px-4 pt-2 flex gap-2 text-xs font-bold">
            <button
              onClick={() => {
                setActiveTab('camera');
                setSelectedImage(null);
                startCamera(facingMode);
              }}
              className={`pb-2.5 px-3 flex items-center gap-1.5 border-b-2 transition-all ${
                activeTab === 'camera'
                  ? 'border-amber-500 text-black font-extrabold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Camera className="w-4 h-4 text-amber-500" />
              <span>Снять на камеру</span>
            </button>
            <button
              onClick={() => {
                stopCamera();
                setActiveTab('gallery');
                setSelectedImage(null);
              }}
              className={`pb-2.5 px-3 flex items-center gap-1.5 border-b-2 transition-all ${
                activeTab === 'gallery'
                  ? 'border-amber-500 text-black font-extrabold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <ImageIcon className="w-4 h-4 text-amber-500" />
              <span>Галерея и файлы</span>
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {searchError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-xs font-semibold text-red-700 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
              <div>{searchError}</div>
            </div>
          )}

          {/* 1. Camera Viewfinder */}
          {!selectedImage && activeTab === 'camera' && (
            <div className="space-y-4">
              {cameraError ? (
                <div className="bg-amber-50 border border-amber-200 rounded-3xl p-6 text-center space-y-3">
                  <Camera className="w-10 h-10 text-amber-600 mx-auto" />
                  <p className="text-xs text-amber-900 font-medium max-w-md mx-auto">
                    {cameraError}
                  </p>
                  <button
                    onClick={() => {
                      stopCamera();
                      setActiveTab('gallery');
                    }}
                    className="px-4 py-2 bg-black text-amber-400 rounded-xl text-xs font-bold hover:bg-zinc-800 transition-colors inline-flex items-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Выбрать фото из галереи</span>
                  </button>
                </div>
              ) : (
                <div className="relative aspect-[4/3] sm:aspect-[16/10] bg-black rounded-3xl overflow-hidden border-2 border-zinc-800 shadow-inner flex items-center justify-center">
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    autoPlay
                    className="w-full h-full object-cover"
                  />
                  <canvas ref={canvasRef} className="hidden" />

                  {/* Scanner HUD Overlay */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
                    <div className="relative w-48 h-48 sm:w-64 sm:h-64 border-2 border-dashed border-amber-400/80 rounded-3xl">
                      {/* Corner marks */}
                      <div className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-amber-400 rounded-tl-xl" />
                      <div className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-amber-400 rounded-tr-xl" />
                      <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-amber-400 rounded-bl-xl" />
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-amber-400 rounded-br-xl" />

                      {/* Scanning laser beam animation */}
                      <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent animate-pulse" style={{ top: '50%' }} />
                    </div>
                  </div>

                  {/* Camera control buttons */}
                  <div className="absolute bottom-4 inset-x-0 flex items-center justify-center gap-4 px-4 pointer-events-auto">
                    <button
                      type="button"
                      onClick={toggleFacingMode}
                      className="p-3 bg-black/70 hover:bg-black text-white rounded-full backdrop-blur-md border border-zinc-700 shadow-lg active:scale-90 transition-transform"
                      title="Переключить камеру"
                    >
                      <FlipHorizontal className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={capturePhoto}
                      className="w-16 h-16 rounded-full bg-amber-400 hover:bg-amber-300 text-black flex items-center justify-center shadow-2xl border-4 border-white active:scale-95 transition-transform"
                      title="Сделать снимок"
                    >
                      <div className="w-12 h-12 rounded-full border-2 border-black flex items-center justify-center">
                        <Camera className="w-6 h-6" />
                      </div>
                    </button>
                  </div>
                </div>
              )}

              <p className="text-[11px] text-center text-slate-400">
                Наведите камеру на вещь или обувь и нажмите желтую кнопку для моментального распознавания
              </p>
            </div>
          )}

          {/* 2. Gallery & File Upload */}
          {!selectedImage && activeTab === 'gallery' && (
            <div className="space-y-4">
              <label className="border-2 border-dashed border-slate-300 hover:border-amber-400 rounded-3xl p-8 sm:p-12 flex flex-col items-center justify-center gap-3 cursor-pointer bg-slate-50/60 hover:bg-amber-50/20 transition-all text-center">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shadow-xs">
                  <Upload className="w-7 h-7" />
                </div>
                <div>
                  <span className="text-sm font-bold text-slate-900 block">
                    Нажмите для выбора фото из галереи
                  </span>
                  <span className="text-xs text-slate-400 mt-1 block">
                    или перетащите изображение сюда, либо нажмите <kbd className="px-1.5 py-0.5 bg-slate-200 text-slate-700 rounded font-mono text-[10px]">Ctrl+V</kbd> для вставки из буфера
                  </span>
                </div>
                <span className="text-[10px] font-semibold text-amber-700 bg-amber-100/70 px-3 py-1 rounded-full mt-1">
                  Поддерживаются форматы JPG, PNG, WEBP любого разрешения
                </span>
              </label>
            </div>
          )}

          {/* 3. Image Preview & Search Analysis Results */}
          {selectedImage && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-center gap-4 p-3 bg-slate-900 text-white rounded-2xl border border-zinc-800">
                <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden border-2 border-amber-400 shrink-0 bg-black">
                  <img
                    src={selectedImage}
                    alt="Поиск по фото"
                    className="w-full h-full object-cover"
                  />
                  {isSearching && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <RefreshCw className="w-5 h-5 text-amber-400 animate-spin" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0 text-center sm:text-left">
                  {isSearching ? (
                    <div className="space-y-1">
                      <div className="flex items-center justify-center sm:justify-start gap-2 text-xs font-bold text-amber-400">
                        <Sparkles className="w-4 h-4 animate-spin" />
                        <span>Нейросеть Gemini 3.8 Flash анализирует фото...</span>
                      </div>
                      <p className="text-[11px] text-zinc-400">
                        Распознаем категорию, крой, цвет и подбираем точные аналоги из базы M.Savdo
                      </p>
                    </div>
                  ) : searchResult ? (
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase font-bold tracking-wider text-amber-400">
                        Распознано ИИ:
                      </div>
                      <h3 className="text-sm font-extrabold text-white truncate">
                        {searchResult.identified.product_name || 'Товар с фото'}
                      </h3>
                      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 pt-0.5">
                        {searchResult.identified.category_name && (
                          <span className="text-[10px] font-bold bg-zinc-800 text-zinc-200 px-2 py-0.5 rounded-md">
                            {searchResult.identified.category_name}
                          </span>
                        )}
                        {searchResult.identified.color && (
                          <span className="text-[10px] font-bold bg-amber-400 text-black px-2 py-0.5 rounded-md">
                            Цвет: {searchResult.identified.color}
                          </span>
                        )}
                        <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-800">
                          Найдено {searchResult.total_found} похожих
                        </span>
                      </div>
                    </div>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={handleReset}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-xl text-xs font-bold transition-colors shrink-0"
                >
                  Другое фото
                </button>
              </div>

              {/* Matching products grid */}
              {isSearching ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 py-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="bg-slate-100 rounded-2xl p-3 animate-pulse space-y-2">
                      <div className="aspect-square bg-slate-200 rounded-xl" />
                      <div className="h-3 bg-slate-200 rounded w-3/4" />
                      <div className="h-3 bg-slate-200 rounded w-1/2" />
                    </div>
                  ))}
                </div>
              ) : searchResult && searchResult.products.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Наиболее подходящие товары каталога:</span>
                    </span>
                    {onApplySearchQuery && searchResult.identified.product_name && (
                      <button
                        onClick={() => {
                          onApplySearchQuery(searchResult.identified.product_name);
                          onClose();
                        }}
                        className="text-amber-700 hover:text-amber-900 font-bold underline text-[11px] flex items-center gap-1"
                      >
                        <span>Показать все в каталоге</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {searchResult.products.map((p) => {
                      const variants = p.variants || [];
                      const prices = variants.map((v) => v.price_tjs).filter((pr) => pr > 0);
                      const minPrice = prices.length > 0 ? Math.min(...prices) : (p.min_price_tjs || 0);

                      return (
                        <div
                          key={p.id}
                          onClick={() => {
                            onSelectProduct(p);
                            onClose();
                          }}
                          className="group cursor-pointer bg-white border border-slate-200 hover:border-amber-400 rounded-2xl p-2.5 transition-all shadow-xs hover:shadow-md flex flex-col justify-between"
                        >
                          <div className="relative aspect-square bg-slate-100 rounded-xl overflow-hidden mb-2">
                            <img
                              src={p.main_image || 'https://placehold.co/200x200?text=M.Savdo'}
                              alt={p.title}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                            <div className="absolute top-1.5 left-1.5 bg-black/80 text-amber-400 font-mono text-[9px] font-bold px-1.5 py-0.5 rounded">
                              {p.base_sku}
                            </div>
                            {p.delivery_type === 'stock' ? (
                              <div className="absolute bottom-1.5 left-1.5 max-w-[85%] whitespace-normal break-words bg-emerald-600/90 text-white text-[8px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                                <Truck className="w-2.5 h-2.5" />
                                <span className="min-w-0 leading-tight">В наличии (Доставка 1 день)</span>
                              </div>
                            ) : (
                              <div className="absolute bottom-1.5 left-1.5 max-w-[85%] whitespace-normal break-words bg-black/85 text-amber-300 text-[8px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                                <Clock className="w-2.5 h-2.5 text-amber-400" />
                                <span className="min-w-0 leading-tight">Под заказ: 15-30 дней напрямую с фабрики</span>
                              </div>
                            )}
                          </div>

                          <div>
                            <div className="text-[9px] font-bold text-amber-700 uppercase tracking-wider line-clamp-1">
                              {p.category_name}
                            </div>
                            <h4 className="text-xs font-bold text-slate-900 line-clamp-2 leading-tight group-hover:text-amber-600 transition-colors mt-0.5">
                              {p.title}
                            </h4>
                          </div>

                          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
                            <span className="font-extrabold text-xs font-mono text-slate-900">
                              {minPrice > 0 ? `${minPrice} TJS` : 'Цена по запросу'}
                            </span>
                            <span className="p-1 bg-black text-amber-400 rounded-lg group-hover:bg-amber-400 group-hover:text-black transition-colors">
                              <Eye className="w-3.5 h-3.5" />
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : searchResult && searchResult.products.length === 0 ? (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-center space-y-2">
                  <Search className="w-8 h-8 text-slate-400 mx-auto" />
                  <h4 className="text-xs font-bold text-slate-800">
                    Точных совпадений по этому фото не найдено
                  </h4>
                  <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                    Попробуйте сделать снимок с другого ракурса при лучшем освещении или воспользуйтесь поиском по названию.
                  </p>
                  <button
                    onClick={handleReset}
                    className="mt-2 px-4 py-2 bg-black text-amber-400 rounded-xl text-xs font-bold hover:bg-zinc-800 transition-colors"
                  >
                    Попробовать еще раз
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1.5 text-[11px]">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Умный визуальный поиск M.Savdo</span>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-bold transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
