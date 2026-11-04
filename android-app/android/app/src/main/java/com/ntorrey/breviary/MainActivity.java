package com.ntorrey.breviary;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
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
 * We keep the web page clear of them (padding) and paint what shows behind them
 * in the page's background colour (light / dark / black), which the page reports
 * through window.BreviaryAndroid.setStatusBarColor(...). Both bars therefore
 * match the page.
 *
 * Reading mode calls window.BreviaryAndroid.setImmersive(true): the status and
 * navigation bars are hidden and the page fills the whole screen. A swipe from
 * the edge shows them briefly.
 */
public class MainActivity extends BridgeActivity {

    private static final int BAR_TYPES = WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout();

    private final ColorDrawable background = new ColorDrawable(Color.parseColor("#16130f"));
    private WindowInsetsControllerCompat insetsController;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setBackgroundDrawable(background);

        View decor = window.getDecorView();
        insetsController = WindowCompat.getInsetsController(window, decor);
        insetsController.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        applyBarColor(background.getColor());

        // Hidden bars report zero insets, so in reading mode the padding drops to
        // just the camera cutout (if any) and the page fills the screen.
        ViewCompat.setOnApplyWindowInsetsListener(decor, (v, insets) -> {
            Insets bars = insets.getInsets(BAR_TYPES);
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            boolean keyboard = insets.isVisible(WindowInsetsCompat.Type.ime());
            v.setPadding(bars.left, bars.top, bars.right, keyboard ? Math.max(ime.bottom, bars.bottom) : bars.bottom);
            // Tell the web page the bars take no space (we already padded for them).
            return new WindowInsetsCompat.Builder(insets).setInsets(BAR_TYPES, Insets.NONE).build();
        });

        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            webView.setBackgroundColor(background.getColor());
            webView.addJavascriptInterface(new PageBridge(), "BreviaryAndroid");
            // Fallback in case the bridge object isn't visible to the first page load:
            // read the page's theme-color meta tag once it has loaded.
            getBridge().addWebViewListener(new WebViewListener() {
                @Override
                public void onPageLoaded(WebView view) {
                    view.evaluateJavascript(
                        "(document.getElementById('themeColor')||document.querySelector('meta[name=theme-color]')||{}).content||''",
                        (value) -> {
                            if (value != null) setBarColorFromString(value.replace("\"", ""));
                        }
                    );
                }
            });
        }
    }

    private void setBarColorFromString(String raw) {
        Integer color = parseColor(raw);
        if (color != null) runOnUiThread(() -> applyBarColor(color));
    }

    /** Paints both system bars with the page's background colour, with readable icons. */
    private void applyBarColor(int color) {
        background.setColor(color);
        double luminance = (0.299 * Color.red(color) + 0.587 * Color.green(color) + 0.114 * Color.blue(color)) / 255.0;
        boolean light = luminance > 0.6;
        if (insetsController != null) {
            insetsController.setAppearanceLightStatusBars(light);
            insetsController.setAppearanceLightNavigationBars(light);
        }
    }

    private void setImmersive(boolean on) {
        if (insetsController == null) return;
        if (on) insetsController.hide(WindowInsetsCompat.Type.systemBars());
        else insetsController.show(WindowInsetsCompat.Type.systemBars());
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

        /** The page's background colour; used for both system bars. */
        @JavascriptInterface
        public void setStatusBarColor(String color) {
            setBarColorFromString(color);
        }

        /** Reading mode: hide (true) or restore (false) the status and navigation bars. */
        @JavascriptInterface
        public void setImmersive(boolean on) {
            runOnUiThread(() -> MainActivity.this.setImmersive(on));
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
}
