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
 *   - Status bar (top): the page sits below it; the strip behind it is painted in
 *     the page's background colour, reported through
 *     window.BreviaryAndroid.setStatusBarColor(...).
 *   - Navigation bar (bottom): fully transparent; the page itself shows through.
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

        // The navigation bar is fully transparent: the page is drawn behind it and
        // shows through. (Android otherwise adds a translucent scrim behind
        // 3-button navigation.)
        window.setNavigationBarColor(Color.TRANSPARENT);
        if (android.os.Build.VERSION.SDK_INT >= 29) window.setNavigationBarContrastEnforced(false);

        // Top: padding keeps the page below the status bar (painted in the page colour).
        // Bottom: no padding; the page runs behind the transparent navigation bar and
        // is told how much room to leave (CSS variable --bottom-inset).
        // Hidden bars report zero insets, so in reading mode only the camera cutout
        // (if any) remains and the page fills the screen.
        ViewCompat.setOnApplyWindowInsetsListener(decor, (v, insets) -> {
            Insets bars = insets.getInsets(BAR_TYPES);
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            boolean keyboard = insets.isVisible(WindowInsetsCompat.Type.ime());
            v.setPadding(bars.left, bars.top, bars.right, keyboard ? ime.bottom : 0);
            bottomInsetCss = keyboard ? 0 : Math.round(bars.bottom / getResources().getDisplayMetrics().density);
            pushBottomInset();
            // Tell the web page the bars take no space; we handle them ourselves.
            return new WindowInsetsCompat.Builder(insets).setInsets(BAR_TYPES, Insets.NONE).build();
        });

        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            webView.setBackgroundColor(background.getColor());
            // No stretch / glow when scrolling past the top or bottom.
            webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
            webView.addJavascriptInterface(new PageBridge(), "BreviaryAndroid");
            // Fallback in case the bridge object isn't visible to the first page load:
            // read the page's theme-color meta tag once it has loaded.
            getBridge().addWebViewListener(new WebViewListener() {
                @Override
                public void onPageLoaded(WebView view) {
                    pushBottomInset();
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

    /** Height of the navigation bar in CSS pixels (0 when hidden or when the keyboard is up). */
    private int bottomInsetCss = 0;

    private void pushBottomInset() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        String js = "document.documentElement.style.setProperty('--bottom-inset','" + bottomInsetCss + "px')";
        getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(js, null));
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

    // (Not named setImmersive: Activity already has a final method of that name.)
    private void applyFullScreen(boolean on) {
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
            runOnUiThread(() -> applyFullScreen(on));
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
