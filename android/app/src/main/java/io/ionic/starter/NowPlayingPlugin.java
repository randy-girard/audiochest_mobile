package io.ionic.starter;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.NativePlugin;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;

@NativePlugin(name = "NowPlaying")
public class NowPlayingPlugin extends Plugin {
  static final String EXTRA_ACTION = "audiochest_action";
  static final String EXTRA_SEEK = "audiochest_seek";

  private static NowPlayingPlugin instance;

  @Override
  public void load() {
    instance = this;
    Activity activity = getActivity();
    if (activity != null) handleLaunchIntent(activity.getIntent());
  }

  @Override
  protected void handleOnNewIntent(Intent intent) {
    handleLaunchIntent(intent);
  }

  @Override
  protected void handleOnDestroy() {
    if (instance == this) instance = null;
  }

  @PluginMethod
  public void update(PluginCall call) {
    if (Build.VERSION.SDK_INT >= 33 && !hasPermission(Manifest.permission.POST_NOTIFICATIONS)) {
      pluginRequestPermission(Manifest.permission.POST_NOTIFICATIONS, 9033);
    }
    NowPlayingService.apply(getContext(), NowPlayingState.fromCall(call));
    call.success();
  }

  @PluginMethod
  public void consumePendingAction(PluginCall call) {
    call.success(NowPlayingService.consumePendingAction(getContext()));
  }

  static boolean deliver(final String action, final Double seekTime) {
    final NowPlayingPlugin plugin = instance;
    if (plugin == null) return false;
    return plugin.deliverToPage(action, seekTime);
  }

  private boolean deliverToPage(String action, Double seekTime) {
    JSObject data = new JSObject();
    data.put("action", action);
    if (seekTime != null) data.put("seekTime", seekTime);
    if (!hasListeners("action")) return false;
    notifyListeners("action", data, false);
    return true;
  }

  static void handleLaunchIntent(Intent intent) {
    if (intent == null) return;
    String action = intent.getStringExtra(EXTRA_ACTION);
    if (action == null || action.isEmpty()) return;
    Double seek = intent.hasExtra(EXTRA_SEEK) ? intent.getDoubleExtra(EXTRA_SEEK, 0d) : null;
    intent.removeExtra(EXTRA_ACTION);
    intent.removeExtra(EXTRA_SEEK);
    MainActivity activity = MainActivity.current();
    if (activity != null) {
      activity.dispatchTransport(action, seek);
      return;
    }
    Context context = instance != null ? instance.getContext() : null;
    NowPlayingService.queuePending(context, action, seek);
  }
}
