package com.ntorrey.breviary;

import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.drawable.Drawable;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.annotation.NonNull;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

/**
 * Hosts the Breviary web app.
 *
 * Android 15+ always draws apps edge to edge, so the system bars are see-through.
 * We keep the web page clear of them (padding) and paint what shows behind them:
 *   - bottom navigation bar: always black, with light buttons;
 *   - top status bar: the page's theme colour (light / dark / black), which the
 *     page reports through window.BreviaryAndroid.setStatusBarColor(...).
 */
public class MainActivity extends BridgeActivity {

    private static final int STATUS_TYPES = WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout();

    private final BarsBackground barsBackground = new BarsBackground();
    private WindowInsetsControllerCompat insetsController;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setBackgroundDrawable(barsBackground);

        View decor = window.getDecorView();
        insetsController = WindowCompat.getInsetsController(window, decor);
        insetsController.setAppearanceLightNavigationBars(false); // light buttons on black
        applyStatusBarColor(Color.parseColor("#16130f"));

        ViewCompat.setOnApplyWindowInsetsListener(decor, (v, insets) -> {
            Insets bars = insets.getInsets(STATUS_TYPES);
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            boolean keyboard = insets.isVisible(WindowInsetsCompat.Type.ime());
            v.setPadding(bars.left, bars.top, bars.right, keyboard ? Math.max(ime.bottom, bars.bottom) : bars.bottom);
            barsBackground.setTopHeight(bars.top);
            // Tell the web page the bars take no space (we already padded for them).
            return new WindowInsetsCompat.Builder(insets).setInsets(STATUS_TYPES, Insets.NONE).build();
        });

        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            webView.setBackgroundColor(Color.BLACK);
            webView.addJavascriptInterface(new PageBridge(), "BreviaryAndroid");
            // Fallback in case the bridge object isn't visible to the first page load:
            // read the page's theme-color meta tag once it has loaded.
            getBridge().addWebViewListener(new WebViewListener() {
                @Override
                public void onPageLoaded(WebView view) {
                    view.evaluateJavascript(
                        "(document.getElementById('themeColor')||document.querySelector('meta[name=theme-color]')||{}).content||''",
                        (value) -> {
                            if (value != null) setStatusBarColorFromString(value.replace("\"", ""));
                        }
                    );
                }
            });
        }
    }

    private void setStatusBarColorFromString(String raw) {
        Integer color = parseColor(raw);
        if (color != null) runOnUiThread(() -> applyStatusBarColor(color));
    }

    private void applyStatusBarColor(int color) {
        barsBackground.setTopColor(color);
        double luminance = (0.299 * Color.red(color) + 0.587 * Color.green(color) + 0.114 * Color.blue(color)) / 255.0;
        if (insetsController != null) insetsController.setAppearanceLightStatusBars(luminance > 0.6);
    }

    /** Accepts #rgb, #rrggbb and #aarrggbb. */
    private static Integer parseColor(String raw) {
        if (raw == null) return null;
        String s = raw.trim();
        if (s.matches("#[0-9a-fA-F]{3}")) {
            s = "#" + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2) + s.charAt(3) + s.charAt(3);
        }
        try {
            return Color.parseColor(s);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    /** Methods callable from the page as window.BreviaryAndroid.*. */
    private class PageBridge {

        @JavascriptInterface
        public void setStatusBarColor(String color) {
            setStatusBarColorFromString(color);
        }

        /** "Keep screen on while praying" (the WebView has no Wake Lock API). */
        @JavascriptInterface
        public void keepScreenOn(boolean on) {
            runOnUiThread(() -> {
                if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }
    }

    /** Paints the area behind the status bar in the theme colour, and everything else black. */
    private static class BarsBackground extends Drawable {

        private final Paint paint = new Paint();
        private int topHeight = 0;
        private int topColor = Color.BLACK;

        void setTopHeight(int h) {
            if (h != topHeight) {
                topHeight = h;
                invalidateSelf();
            }
        }

        void setTopColor(int c) {
            if (c != topColor) {
                topColor = c;
                invalidateSelf();
            }
        }

        @Override
        public void draw(@NonNull Canvas canvas) {
            canvas.drawColor(Color.BLACK);
            if (topHeight > 0) {
                paint.setColor(topColor);
                canvas.drawRect(0, 0, getBounds().width(), topHeight, paint);
            }
        }

        @Override
        public void setAlpha(int alpha) {}

        @Override
        public void setColorFilter(ColorFilter colorFilter) {}

        @Override
        public int getOpacity() {
            return PixelFormat.OPAQUE;
        }
    }
}
