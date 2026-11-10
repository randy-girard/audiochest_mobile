package io.ionic.starter;

import android.content.Intent;
import android.os.Bundle;
import android.os.Looper;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;

import org.json.JSONObject;

import java.util.ArrayList;

public class MainActivity extends BridgeActivity {
  private static volatile MainActivity current;

  static MainActivity current() {
    return current;
  }

  @Override
  public void onCreate(Bundle savedInstanceState) {
    current = this;
    super.onCreate(savedInstanceState);

    this.init(savedInstanceState, new ArrayList<Class<? extends Plugin>>() {{
      add(NowPlayingPlugin.class);
      add(AppUpdatePlugin.class);
    }});
    NowPlayingPlugin.handleLaunchIntent(getIntent());
  }

  @Override
  public void onDestroy() {
    if (current == this) current = null;
    super.onDestroy();
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    NowPlayingPlugin.handleLaunchIntent(intent);
  }

  @Override
  public void onPause() {
    super.onPause();
    keepWebViewAlive();
  }

  @Override
  public void onStop() {
    super.onStop();
    keepWebViewAlive();
  }

  void dispatchTransport(String action, Double seekTime) {
    if (Looper.myLooper() != Looper.getMainLooper()) {
      runOnUiThread(() -> dispatchTransport(action, seekTime));
      return;
    }
    wakeWebView();
    boolean delivered = NowPlayingPlugin.deliver(action, seekTime);
    WebView view = this.bridge == null ? null : this.bridge.getWebView();
    if (view != null) {
      String seek = seekTime == null ? "null" : String.valueOf(seekTime.doubleValue());
      view.evaluateJavascript(
          "window.__audiochestTransport&&window.__audiochestTransport(" + JSONObject.quote(action) + "," + seek + ")",
          null);
    }
    if (!delivered) NowPlayingService.queuePending(this, action, seekTime);
  }

  private void keepWebViewAlive() {
    if (!NowPlayingService.shouldKeepWebViewAlive()) return;
    wakeWebView();
  }

  private void wakeWebView() {
    if (this.bridge == null) return;
    WebView webView = this.bridge.getWebView();
    if (webView == null) return;
    try {
      webView.onResume();
      webView.resumeTimers();
    } catch (Exception ignored) {
      // Playback can continue without forcing the WebView awake.
    }
  }
}
