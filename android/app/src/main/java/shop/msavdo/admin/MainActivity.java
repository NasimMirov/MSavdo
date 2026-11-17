package shop.msavdo.admin;

import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.Gravity;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.Locale;
import java.util.Queue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final String ADMIN_URL = "https://msavdo.shop/?mobile-admin=1";
    private static final String API_URL = "https://api.msavdo.shop/api/parse-product-html";
    private static final String API_ORIGIN = "https://api.msavdo.shop";
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private final Queue<String> imports = new ArrayDeque<>();
    private WebView web;
    private TextView status;
    private Button next;
    private boolean autoImport;
    private Runnable pendingCapture;
    private String loadedUrl;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        CookieManager.getInstance().setAcceptCookie(true);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);
        LinearLayout bar = new LinearLayout(this);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(8), dp(4), dp(8), dp(4));
        bar.setBackgroundColor(Color.rgb(17, 24, 39));
        Button admin = button("Админка");
        Button queue = button("Импорт 1688");
        next = button("Далее");
        next.setEnabled(false);
        bar.addView(admin, new LinearLayout.LayoutParams(0, dp(44), 1));
        bar.addView(queue, new LinearLayout.LayoutParams(0, dp(44), 1));
        bar.addView(next, new LinearLayout.LayoutParams(0, dp(44), .7f));
        root.addView(bar);
        status = new TextView(this);
        status.setText("Готово");
        status.setTextSize(12);
        status.setPadding(dp(8), 0, dp(8), 0);
        root.addView(status, new LinearLayout.LayoutParams(-1, dp(26)));

        web = new WebView(this);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setLoadsImagesAutomatically(true);
        web.addJavascriptInterface(new ImportBridge(), "MSavdoMobile");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String scheme = request.getUrl().getScheme();
                return !("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme));
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                cancelPendingCapture();
                loadedUrl = url;
            }
            @Override public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (marketplace(url)) {
                    status.setText("Страница товара открыта");
                    handler.postDelayed(() -> addImportButton(url), 2200);
                    if (autoImport && !imports.isEmpty()) {
                        pendingCapture = () -> {
                            if (url.equals(loadedUrl) && url.equals(web.getUrl())) capture(url);
                        };
                        handler.postDelayed(pendingCapture, 4500);
                    }
                }
            }
        });
        root.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(root);
        admin.setOnClickListener(v -> web.loadUrl(ADMIN_URL));
        queue.setOnClickListener(v -> showQueue());
        next.setOnClickListener(v -> openNext());
        web.loadUrl(ADMIN_URL);
    }

    private Button button(String text) {
        Button b = new Button(this);
        b.setText(text);
        b.setTextSize(12);
        b.setAllCaps(false);
        b.setTextColor(Color.rgb(17, 24, 39));
        b.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(245, 197, 66)));
        return b;
    }
    private int dp(int n) { return (int)(n * getResources().getDisplayMetrics().density); }

    private void showQueue() {
        EditText input = new EditText(this);
        input.setHint("Вставьте ссылки 1688, по одной в строке");
        input.setMinLines(5);
        input.setGravity(Gravity.TOP | Gravity.START);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        new AlertDialog.Builder(this).setTitle("Массовый импорт")
            .setMessage("Ссылки будут открыты по очереди, каждый товар сохранится черновиком.")
            .setView(input).setNegativeButton("Отмена", null)
            .setPositiveButton("Начать", (d, w) -> {
                imports.clear();
                for (String line : input.getText().toString().split("[\\r\\n,;]+")) {
                    String url = line.trim();
                    if (marketplace(url)) imports.add(url);
                }
                autoImport = !imports.isEmpty();
                next.setEnabled(autoImport);
                if (autoImport) openNext();
                else Toast.makeText(this, "Добавьте корректные ссылки на товары", Toast.LENGTH_LONG).show();
            }).show();
    }

    private void openNext() {
        String url = imports.peek();
        if (url == null) {
            autoImport = false;
            next.setEnabled(false);
            status.setText("Очередь завершена");
            return;
        }
        status.setText("Открываю товар · в очереди " + imports.size());
        web.loadUrl(url);
    }

    private boolean marketplace(String value) {
        try {
            String h = new URL(value).getHost().toLowerCase(Locale.ROOT);
            return h.equals("1688.com") || h.endsWith(".1688.com")
                || h.equals("taobao.com") || h.endsWith(".taobao.com")
                || h.equals("tmall.com") || h.endsWith(".tmall.com")
                || h.equals("alibaba.com") || h.endsWith(".alibaba.com")
                || h.equals("pinduoduo.com") || h.endsWith(".pinduoduo.com")
                || h.equals("yangkeduo.com") || h.endsWith(".yangkeduo.com");
        } catch (Exception ignored) { return false; }
    }

    private void cancelPendingCapture() {
        if (pendingCapture != null) {
            handler.removeCallbacks(pendingCapture);
            pendingCapture = null;
        }
    }

    private boolean trustedBridgePage() {
        String url = web == null ? null : web.getUrl();
        return url != null && (url.startsWith(ADMIN_URL) || marketplace(url));
    }

    private void addImportButton(String pageUrl) {
        if (!marketplace(pageUrl)) return;
        String script = "(function(){if(document.getElementById('msavdo-import-now'))return;"
            + "var b=document.createElement('button');b.id='msavdo-import-now';b.textContent='Добавить в M.Savdo';"
            + "b.style='position:fixed;z-index:2147483647;bottom:24px;right:16px;padding:14px 18px;border:0;border-radius:16px;background:#f5c542;color:#111827;font:bold 15px sans-serif;box-shadow:0 5px 22px #0005';"
            + "b.onclick=function(){b.textContent='Сохраняю…';window.MSavdoMobile.capture(JSON.stringify({url:location.href,title:document.title,html:document.documentElement.outerHTML}));};document.body.appendChild(b);})();";
        web.evaluateJavascript(script, null);
    }

    private void capture(String pageUrl) {
        if (!marketplace(pageUrl) || !pageUrl.equals(web.getUrl())) return;
        web.evaluateJavascript("JSON.stringify({url:location.href,title:document.title,html:document.documentElement.outerHTML})",
            value -> {
                if (value == null || "null".equals(value)) return;
                try {
                    String text = new JSONArray("[" + value + "]").getString(0);
                    new ImportBridge().capture(text);
                } catch (Exception e) {
                    handler.post(() -> Toast.makeText(MainActivity.this, "Не удалось прочитать страницу", Toast.LENGTH_LONG).show());
                }
            });
    }

    private final class ImportBridge {
        @JavascriptInterface public void capture(String text) {
            if (!trustedBridgePage()) return;
            final JSONObject page;
            try { page = new JSONObject(text); }
            catch (Exception e) { handler.post(() -> Toast.makeText(MainActivity.this, "Не удалось прочитать страницу", Toast.LENGTH_LONG).show()); return; }
            network.execute(() -> importPage(page));
        }
    }

    private void importPage(JSONObject page) {
        HttpURLConnection conn = null;
        try {
            String html = page.optString("html", "");
            if (html.isEmpty() || html.length() > 2_000_000) throw new Exception("Страница пустая или слишком большая");
            String cookie = CookieManager.getInstance().getCookie(API_ORIGIN);
            if (cookie == null || !cookie.contains("__Host-msavdo_admin=")) throw new Exception("Сначала войдите через Telegram");
            JSONObject body = new JSONObject();
            body.put("html_code", html);
            body.put("original_link", page.optString("url", ""));
            body.put("manual_title", page.optString("title", ""));
            body.put("weight_kg", 0.5);
            body.put("delivery_type", "order");
            body.put("save_to_catalog", true);
            conn = (HttpURLConnection)new URL(API_URL).openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(20000);
            conn.setReadTimeout(90000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            conn.setRequestProperty("Cookie", cookie);
            byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
            conn.setFixedLengthStreamingMode(payload.length);
            try (OutputStream stream = conn.getOutputStream()) { stream.write(payload); }
            int code = conn.getResponseCode();
            java.io.InputStream stream = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int n;
            while ((n = stream.read(buffer)) != -1) bytes.write(buffer, 0, n);
            JSONObject result = new JSONObject(bytes.toString("UTF-8"));
            if (code < 200 || code >= 300 || !result.optBoolean("success"))
                throw new Exception(result.optString("error", result.optString("message", "Ошибка импорта HTTP " + code)));
            JSONObject product = result.optJSONObject("product");
            String title = product == null ? "Товар" : product.optString("title", "Товар");
            handler.post(() -> {
                status.setText("Черновик добавлен: " + title);
                Toast.makeText(MainActivity.this, "Черновик добавлен: " + title, Toast.LENGTH_LONG).show();
                if (imports.peek() != null && imports.peek().equals(page.optString("url"))) imports.poll();
                next.setEnabled(!imports.isEmpty());
                if (!imports.isEmpty()) handler.postDelayed(this::openNext, 1400);
                else autoImport = false;
            });
        } catch (Exception e) {
            String message = e.getMessage() == null ? "Ошибка импорта" : e.getMessage();
            handler.post(() -> {
                status.setText(message);
                Toast.makeText(MainActivity.this, message, Toast.LENGTH_LONG).show();
                next.setEnabled(!imports.isEmpty());
                autoImport = false;
            });
        } finally { if (conn != null) conn.disconnect(); }
    }

    @Override public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
    @Override protected void onDestroy() {
        cancelPendingCapture();
        network.shutdownNow();
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
