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

  static boolean emit(final String action, final Double seekTime) {
    final NowPlayingPlugin plugin = instance;
    if (plugin == null) return false;
    final Runnable task = new Runnable() {
      @Override
      public void run() {
        JSObject data = new JSObject();
        data.put("action", action);
        if (seekTime != null) data.put("seekTime", seekTime);
        plugin.notifyListeners("action", data);
      }
    };
    Activity activity = plugin.getActivity();
    if (activity != null) {
      activity.runOnUiThread(task);
    } else {
      task.run();
    }
    return true;
  }

  static void handleLaunchIntent(Intent intent) {
    if (intent == null) return;
    String action = intent.getStringExtra(EXTRA_ACTION);
    if (action == null || action.isEmpty()) return;
    Double seek = intent.hasExtra(EXTRA_SEEK) ? intent.getDoubleExtra(EXTRA_SEEK, 0d) : null;
    Context context = instance != null ? instance.getContext() : null;
    NowPlayingService.queuePending(context, action, seek);
    intent.removeExtra(EXTRA_ACTION);
    intent.removeExtra(EXTRA_SEEK);
  }
}
