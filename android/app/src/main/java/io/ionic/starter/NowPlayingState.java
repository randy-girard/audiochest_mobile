package io.ionic.starter;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.PluginCall;

final class NowPlayingState {
  static final String PREFS = "audiochest.nowplaying";
  static final String PENDING_ACTION = "pendingAction";
  static final String PENDING_SEEK = "pendingSeek";

  final String title;
  final String artist;
  final String album;
  final boolean playing;
  final boolean active;
  final boolean interrupted;
  final long durationMs;
  final long positionMs;
  final int trackId;

  NowPlayingState(
      String title,
      String artist,
      String album,
      boolean playing,
      boolean active,
      boolean interrupted,
      long durationMs,
      long positionMs,
      int trackId
  ) {
    this.title = title;
    this.artist = artist;
    this.album = album;
    this.playing = playing;
    this.active = active;
    this.interrupted = interrupted;
    this.durationMs = durationMs;
    this.positionMs = positionMs;
    this.trackId = trackId;
  }

  NowPlayingState pausedInterrupted() {
    return new NowPlayingState(title, artist, album, false, active, true, durationMs, positionMs, trackId);
  }

  NowPlayingState withPlaying(boolean nextPlaying) {
    return new NowPlayingState(title, artist, album, nextPlaying, active, false, durationMs, positionMs, trackId);
  }

  static NowPlayingState fromCall(PluginCall call) {
    boolean active = Boolean.TRUE.equals(call.getBoolean("active", false));
    Double durationValue = call.getDouble("duration", 0d);
    Double positionValue = call.getDouble("position", 0d);
    double duration = durationValue == null ? 0d : durationValue.doubleValue();
    double position = positionValue == null ? 0d : positionValue.doubleValue();
    long durationMs = Math.max(0L, Math.round(duration * 1000d));
    long positionMs = Math.max(0L, Math.round(position * 1000d));
    if (durationMs > 0 && positionMs > durationMs) positionMs = durationMs;
    int trackId = 0;
    try {
      Integer trackIdValue = call.getInt("trackId");
      if (trackIdValue != null) trackId = trackIdValue.intValue();
    } catch (Exception ignored) {
      // Capacitor may store this as a double.
    }
    if (trackId == 0) {
      try {
        Double trackIdDouble = call.getDouble("trackId");
        if (trackIdDouble != null) trackId = trackIdDouble.intValue();
      } catch (Exception ignored) {
        // Track id is optional for metadata.
      }
    }
    return new NowPlayingState(
        emptyToBlank(call.getString("title", "")),
        emptyToBlank(call.getString("artist", "")),
        emptyToBlank(call.getString("album", "")),
        Boolean.TRUE.equals(call.getBoolean("playing", false)),
        active,
        Boolean.TRUE.equals(call.getBoolean("interrupted", false)),
        durationMs,
        positionMs,
        trackId
    );
  }

  static NowPlayingState inactive() {
    return new NowPlayingState("", "", "", false, false, false, 0L, 0L, 0);
  }

  void save(Context context) {
    SharedPreferences.Editor editor = prefs(context).edit();
    if (!active) {
      editor.clear().apply();
      return;
    }
    editor.putString("title", title)
        .putString("artist", artist)
        .putString("album", album)
        .putBoolean("playing", playing)
        .putBoolean("active", true)
        .putBoolean("interrupted", interrupted)
        .putLong("durationMs", durationMs)
        .putLong("positionMs", positionMs)
        .putInt("trackId", trackId)
        .apply();
  }

  static NowPlayingState load(Context context) {
    SharedPreferences prefs = prefs(context);
    if (!prefs.getBoolean("active", false)) return inactive();
    return new NowPlayingState(
        emptyToBlank(prefs.getString("title", "")),
        emptyToBlank(prefs.getString("artist", "")),
        emptyToBlank(prefs.getString("album", "")),
        prefs.getBoolean("playing", false),
        true,
        prefs.getBoolean("interrupted", false),
        Math.max(0L, prefs.getLong("durationMs", 0L)),
        Math.max(0L, prefs.getLong("positionMs", 0L)),
        prefs.getInt("trackId", 0)
    );
  }

  static void savePending(Context context, String action, Double seekTime) {
    SharedPreferences.Editor editor = prefs(context).edit();
    if (action == null || action.isEmpty()) {
      editor.remove(PENDING_ACTION).remove(PENDING_SEEK).apply();
      return;
    }
    editor.putString(PENDING_ACTION, action);
    if (seekTime != null) editor.putLong(PENDING_SEEK, Double.doubleToRawLongBits(seekTime));
    else editor.remove(PENDING_SEEK);
    editor.apply();
  }

  static String loadPendingAction(Context context) {
    return prefs(context).getString(PENDING_ACTION, null);
  }

  static Double loadPendingSeek(Context context) {
    SharedPreferences prefs = prefs(context);
    if (!prefs.contains(PENDING_SEEK)) return null;
    return Double.longBitsToDouble(prefs.getLong(PENDING_SEEK, 0L));
  }

  private static SharedPreferences prefs(Context context) {
    return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
  }

  private static String emptyToBlank(String value) {
    return value == null ? "" : value;
  }
}
