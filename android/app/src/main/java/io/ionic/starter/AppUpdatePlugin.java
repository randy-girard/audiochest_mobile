package io.ionic.starter;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.NativePlugin;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@NativePlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {
  private static final long MAX_BYTES = 80L * 1024L * 1024L;

  @PluginMethod
  public void info(PluginCall call) {
    try {
      PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
      int code = versionCode(info);
      JSObject result = new JSObject();
      result.put("versionName", info.versionName == null ? "" : info.versionName);
      result.put("versionCode", code);
      call.success(result);
    } catch (Exception error) {
      call.reject(error.getMessage() == null ? "Could not read the app version." : error.getMessage());
    }
  }

  @PluginMethod
  public void installRelease(PluginCall call) {
    String url = call.getString("url");
    if (url == null || url.isEmpty()) {
      call.reject("Missing release URL");
      return;
    }
    Activity activity = getActivity();
    new Thread(() -> {
      try {
        File apk = download(url);
        runOnUi(activity, () -> {
          try {
            openInstaller(apk);
            call.success();
          } catch (Exception error) {
            call.reject(message(error, "Could not open the installer."));
          }
        });
      } catch (Exception error) {
        runOnUi(activity, () -> call.reject(message(error, "Could not download the update.")));
      }
    }).start();
  }

  @SuppressWarnings("deprecation")
  private static int versionCode(PackageInfo info) {
    if (Build.VERSION.SDK_INT >= 28) return (int) info.getLongVersionCode();
    return info.versionCode;
  }

  private File download(String url) throws Exception {
    String current = url;
    for (int hop = 0; hop < 5; hop++) {
      if (!allowed(current)) throw new IllegalArgumentException("Refusing to download an update from " + current);
      HttpURLConnection connection = (HttpURLConnection) new URL(current).openConnection();
      connection.setInstanceFollowRedirects(false);
      connection.setConnectTimeout(20000);
      connection.setReadTimeout(120000);
      connection.setRequestProperty("Accept", "application/octet-stream");
      connection.setRequestProperty("User-Agent", "AudioChest");
      int status = connection.getResponseCode();
      if (status >= 300 && status < 400) {
        String location = connection.getHeaderField("Location");
        connection.disconnect();
        if (location == null || location.isEmpty()) throw new IllegalStateException("Release download redirect was empty");
        current = new URL(new URL(current), location).toString();
        continue;
      }
      if (status != HttpURLConnection.HTTP_OK) {
        connection.disconnect();
        throw new IllegalStateException("Release download returned " + status);
      }
      File apk = new File(getContext().getCacheDir(), "audiochest-update.apk");
      try (InputStream input = connection.getInputStream(); OutputStream output = new FileOutputStream(apk)) {
        byte[] buffer = new byte[8192];
        long total = 0;
        int read;
        while ((read = input.read(buffer)) != -1) {
          total += read;
          if (total > MAX_BYTES) throw new IllegalStateException("Update is too large");
          output.write(buffer, 0, read);
        }
      } finally {
        connection.disconnect();
      }
      if (apk.length() < 1024) throw new IllegalStateException("Downloaded update was empty");
      return apk;
    }
    throw new IllegalStateException("Release download redirected too many times");
  }

  private void openInstaller(File apk) {
    Context context = getContext();
    if (Build.VERSION.SDK_INT >= 26 && !context.getPackageManager().canRequestPackageInstalls()) {
      Intent settings = new Intent(
          android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
          Uri.parse("package:" + context.getPackageName())
      );
      settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      context.startActivity(settings);
      throw new IllegalStateException("Allow AudioChest to install updates, then try again.");
    }
    Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", apk);
    Intent intent = new Intent(Intent.ACTION_VIEW);
    intent.setDataAndType(uri, "application/vnd.android.package-archive");
    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
    context.startActivity(intent);
  }

  private static boolean allowed(String url) {
    try {
      URL parsed = new URL(url);
      if (!"https".equalsIgnoreCase(parsed.getProtocol())) return false;
      String host = parsed.getHost() == null ? "" : parsed.getHost().toLowerCase();
      return "github.com".equals(host) || host.endsWith(".githubusercontent.com");
    } catch (Exception error) {
      return false;
    }
  }

  private static void runOnUi(Activity activity, Runnable action) {
    if (activity != null) activity.runOnUiThread(action);
    else action.run();
  }

  private static String message(Exception error, String fallback) {
    return error.getMessage() == null || error.getMessage().isEmpty() ? fallback : error.getMessage();
  }
}
