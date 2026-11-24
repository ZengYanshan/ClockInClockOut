package com.clockinclockout.app;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayInputStream;
import java.io.IOException;

public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private WebView webView;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(0xfff6f8fc);
        getWindow().setNavigationBarColor(0xfff6f8fc);
        getWindow().getDecorView().setSystemUiVisibility(
            android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                | android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !HOST.equals(request.getUrl().getHost());
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String path = request.getUrl().getPath();
                if (HOST.equals(request.getUrl().getHost()) && path != null && !path.contains("..")) {
                    String asset = path.equals("/") ? "index.html" : path.substring(1);
                    String mime = "application/octet-stream";
                    if (asset.endsWith(".html")) {
                        mime = "text/html";
                    } else if (asset.endsWith(".js")) {
                        mime = "application/javascript";
                    } else if (asset.endsWith(".css")) {
                        mime = "text/css";
                    } else if (asset.endsWith(".svg")) {
                        mime = "image/svg+xml";
                    }
                    try {
                        return new WebResourceResponse(mime, "UTF-8", getAssets().open(asset));
                    } catch (IOException exception) {
                        // Missing assets return a local error without a network request.
                    }
                }
                return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                    java.util.Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
            }
        });
        setContentView(webView);
        webView.loadUrl("https://" + HOST + "/index.html");
    }

    @Override
    public void onBackPressed() {
        webView.evaluateJavascript("Boolean(history.state && (history.state.page !== 'home' || history.state.modal))", value -> {
            if ("true".equals(value)) {
                webView.evaluateJavascript("window.history.back();", null);
            } else {
                finish();
            }
        });
    }

    @Override
    protected void onDestroy() {
        webView.destroy();
        super.onDestroy();
    }
}
