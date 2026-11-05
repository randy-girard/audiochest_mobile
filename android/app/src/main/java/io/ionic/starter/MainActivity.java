package io.ionic.starter;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;

import java.util.ArrayList;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    this.init(savedInstanceState, new ArrayList<Class<? extends Plugin>>() {{
      add(NowPlayingPlugin.class);
    }});
    NowPlayingPlugin.handleLaunchIntent(getIntent());
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

  private void keepWebViewAlive() {
    if (!NowPlayingService.shouldKeepWebViewAlive() || this.bridge == null) return;
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
