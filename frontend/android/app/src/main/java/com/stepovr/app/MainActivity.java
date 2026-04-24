package com.stepovr.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Enable pinch-zoom app-wide. iOS WKWebView respects the viewport meta;
        // Android WebView requires explicit setSupportZoom + setBuiltInZoomControls.
        // setDisplayZoomControls(false) hides the legacy on-screen +/- overlay.
        getBridge().getWebView().getSettings().setSupportZoom(true);
        getBridge().getWebView().getSettings().setBuiltInZoomControls(true);
        getBridge().getWebView().getSettings().setDisplayZoomControls(false);
    }
}
