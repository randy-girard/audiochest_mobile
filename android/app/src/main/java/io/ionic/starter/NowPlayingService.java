package io.ionic.starter;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.media.AudioAttributes;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.support.v4.media.MediaBrowserCompat;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.media.MediaBrowserServiceCompat;
import androidx.media.app.NotificationCompat.MediaStyle;
import androidx.media.session.MediaButtonReceiver;

import com.getcapacitor.JSObject;

import java.util.ArrayList;
import java.util.List;

public class NowPlayingService extends MediaBrowserServiceCompat {
  public static final String CHANNEL_ID = "audiochest.playback";
  public static final int NOTIFICATION_ID = 42;
  private static final String ROOT_ID = "audiochest";
  private static final long ACTIONS =
      PlaybackStateCompat.ACTION_PLAY
          | PlaybackStateCompat.ACTION_PAUSE
          | PlaybackStateCompat.ACTION_PLAY_PAUSE
          | PlaybackStateCompat.ACTION_SKIP_TO_NEXT
          | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
          | PlaybackStateCompat.ACTION_SEEK_TO
          | PlaybackStateCompat.ACTION_STOP
          | PlaybackStateCompat.ACTION_FAST_FORWARD
          | PlaybackStateCompat.ACTION_REWIND;

  private static volatile NowPlayingState latest = NowPlayingState.inactive();
  private static volatile NowPlayingService instance;
  private static volatile String pendingAction;
  private static volatile Double pendingSeek;

  private MediaSessionCompat mediaSession;
  private Bitmap artwork;
  private boolean applyingState;
  private AudioManager audioManager;
  private Object focusRequest;
  private boolean noisyRegistered;
  private Object deviceCallback;
  private boolean holdingFocus;
  private long focusRequestedAt;
  private long lastApplyAt;

  private final AudioManager.OnAudioFocusChangeListener focusListener =
      new AudioManager.OnAudioFocusChangeListener() {
        @Override
        public void onAudioFocusChange(int focusChange) {
          if (applyingState) return;
          if (SystemClock.elapsedRealtime() - focusRequestedAt < 1000) return;
          if (focusChange == AudioManager.AUDIOFOCUS_LOSS
              || focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
            emit("interrupt", null);
          } else if (focusChange == AudioManager.AUDIOFOCUS_GAIN && latest != null && latest.interrupted) {
            emit("play", null);
          }
        }
      };

  private final BroadcastReceiver noisyReceiver = new BroadcastReceiver() {
    @Override
    public void onReceive(Context context, Intent intent) {
      if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction())) {
        emit("interrupt", null);
      }
    }
  };

  static void apply(Context context, NowPlayingState state) {
    latest = state == null ? NowPlayingState.inactive() : state;
    Context app = context.getApplicationContext();
    latest.save(app);
    NowPlayingService running = instance;
    if (running != null) {
      running.updateFromLatest();
      return;
    }
    if (!latest.active) return;
    Intent intent = new Intent(app, NowPlayingService.class);
    if (Build.VERSION.SDK_INT >= 26) {
      app.startForegroundService(intent);
    } else {
      app.startService(intent);
    }
  }

  static boolean shouldKeepWebViewAlive() {
    return latest != null && latest.active;
  }

  static void queuePending(String action, Double seekTime) {
    queuePending(null, action, seekTime);
  }

  static void queuePending(Context context, String action, Double seekTime) {
    pendingAction = action;
    pendingSeek = seekTime;
    if (context != null) NowPlayingState.savePending(context, action, seekTime);
  }

  static JSObject consumePendingAction(Context context) {
    String action = pendingAction;
    Double seek = pendingSeek;
    pendingAction = null;
    pendingSeek = null;
    if ((action == null || action.isEmpty()) && context != null) {
      action = NowPlayingState.loadPendingAction(context);
      seek = NowPlayingState.loadPendingSeek(context);
    }
    if (context != null) NowPlayingState.savePending(context, null, null);
    JSObject data = new JSObject();
    if (action == null || action.isEmpty()) return data;
    data.put("action", action);
    if (seek != null) data.put("seekTime", seek);
    return data;
  }

  @Override
  public void onCreate() {
    super.onCreate();
    instance = this;
    audioManager = (AudioManager) getSystemService(AUDIO_SERVICE);
    createChannel();
    NowPlayingState stored = NowPlayingState.load(this);
    if ((latest == null || !latest.active) && stored.active) {
      latest = stored.playing ? stored.pausedInterrupted() : stored;
    }
    mediaSession = new MediaSessionCompat(this, "AudioChest");
    mediaSession.setFlags(
        MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS | MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
    );
    mediaSession.setPlaybackToLocal(AudioManager.STREAM_MUSIC);
    mediaSession.setCallback(new MediaSessionCompat.Callback() {
      @Override
      public void onPlay() {
        emit("play", null);
      }

      @Override
      public void onPause() {
        emit("pause", null);
      }

      @Override
      public void onSkipToNext() {
        emit("nexttrack", null);
      }

      @Override
      public void onSkipToPrevious() {
        emit("previoustrack", null);
      }

      @Override
      public void onStop() {
        emit("stop", null);
      }

      @Override
      public void onSeekTo(long pos) {
        emit("seekto", pos / 1000d);
      }

      @Override
      public void onFastForward() {
        emit("seekforward", null);
      }

      @Override
      public void onRewind() {
        emit("seekbackward", null);
      }

      @Override
      public boolean onMediaButtonEvent(Intent mediaButtonEvent) {
        KeyEvent event = mediaKey(mediaButtonEvent);
        if (event == null || event.getAction() != KeyEvent.ACTION_DOWN) return false;
        int key = event.getKeyCode();
        if (event.getRepeatCount() > 0) {
          if (key == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD) onFastForward();
          else if (key == KeyEvent.KEYCODE_MEDIA_REWIND) onRewind();
          return true;
        }
        switch (key) {
          case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
          case KeyEvent.KEYCODE_HEADSETHOOK:
          case KeyEvent.KEYCODE_MEDIA_PLAY:
            if (latest != null && latest.playing) onPause();
            else onPlay();
            return true;
          case KeyEvent.KEYCODE_MEDIA_PAUSE:
            onPause();
            return true;
          case KeyEvent.KEYCODE_MEDIA_NEXT:
          case KeyEvent.KEYCODE_MEDIA_SKIP_FORWARD:
            onSkipToNext();
            return true;
          case KeyEvent.KEYCODE_MEDIA_PREVIOUS:
          case KeyEvent.KEYCODE_MEDIA_SKIP_BACKWARD:
            onSkipToPrevious();
            return true;
          case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
            onFastForward();
            return true;
          case KeyEvent.KEYCODE_MEDIA_REWIND:
            onRewind();
            return true;
          default:
            return false;
        }
      }
    });
    Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
    if (launch != null) {
      launch.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
      mediaSession.setSessionActivity(PendingIntent.getActivity(this, 0, launch, pendingFlags()));
    }
    Intent mediaButton = new Intent(Intent.ACTION_MEDIA_BUTTON);
    mediaButton.setClass(this, MediaButtonReceiver.class);
    mediaSession.setMediaButtonReceiver(PendingIntent.getBroadcast(this, 0, mediaButton, pendingFlags()));
    setSessionToken(mediaSession.getSessionToken());
    artwork = loadArtwork();
    registerOutputCallback();
    updateFromLatest();
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    if (intent != null && Intent.ACTION_MEDIA_BUTTON.equals(intent.getAction())) {
      MediaButtonReceiver.handleIntent(mediaSession, intent);
    }
    updateFromLatest();
    return START_STICKY;
  }

  @Override
  public BrowserRoot onGetRoot(@NonNull String clientPackageName, int clientUid, Bundle rootHints) {
    return new BrowserRoot(ROOT_ID, null);
  }

  @Override
  public void onLoadChildren(@NonNull String parentId, @NonNull Result<List<MediaBrowserCompat.MediaItem>> result) {
    result.sendResult(new ArrayList<MediaBrowserCompat.MediaItem>());
  }

  @Override
  public void onDestroy() {
    unregisterOutputCallback();
    unregisterNoisy();
    abandonFocus();
    instance = null;
    if (mediaSession != null) {
      mediaSession.setActive(false);
      mediaSession.release();
      mediaSession = null;
    }
    super.onDestroy();
  }

  @SuppressWarnings("deprecation")
  private static KeyEvent mediaKey(Intent intent) {
    if (intent == null) return null;
    Object extra = intent.getParcelableExtra(Intent.EXTRA_KEY_EVENT);
    return extra instanceof KeyEvent ? (KeyEvent) extra : null;
  }

  private boolean isTransportEcho(String action) {
    if (!"play".equals(action) && !"pause".equals(action)) return false;
    if (SystemClock.elapsedRealtime() - lastApplyAt >= 500) return false;
    if ("play".equals(action)) return latest != null && latest.playing;
    return latest == null || !latest.playing;
  }

  private void emit(String action, Double seekTime) {
    if (applyingState) return;
    if (isTransportEcho(action)) return;
    if (("pause".equals(action) || "interrupt".equals(action))
        && latest != null && latest.active && latest.playing) {
      latest = "interrupt".equals(action) ? latest.pausedInterrupted() : latest.withPlaying(false);
      latest.save(this);
      updateFromLatest();
    }
    MainActivity activity = MainActivity.current();
    if (activity != null) {
      activity.dispatchTransport(action, seekTime);
      return;
    }
    queuePending(this, action, seekTime);
    startUi(action, seekTime);
  }

  private void startUi(String action, Double seekTime) {
    try {
      Intent intent = new Intent(this, MainActivity.class);
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
      intent.putExtra(NowPlayingPlugin.EXTRA_ACTION, action);
      if (seekTime != null) intent.putExtra(NowPlayingPlugin.EXTRA_SEEK, seekTime);
      startActivity(intent);
    } catch (Exception ignored) {
      // Background activity starts can be blocked; the pending action is still delivered on resume.
    }
  }

  private void updateFromLatest() {
    NowPlayingState state = latest;
    if (state == null || !state.active) {
      teardown();
      return;
    }
    applyingState = true;
    try {
      if (state.playing) requestFocus();
      else abandonFocus();
      if (mediaSession != null) {
        mediaSession.setMetadata(metadataFor(state));
        mediaSession.setPlaybackState(playbackStateFor(state));
        mediaSession.setActive(true);
      }
      if (state.playing) registerNoisy();
      else unregisterNoisy();
      Notification notification = notificationFor(state);
      try {
        if (Build.VERSION.SDK_INT >= 29) {
          startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
          startForeground(NOTIFICATION_ID, notification);
        }
      } catch (Exception error) {
        try {
          startForeground(NOTIFICATION_ID, notification);
        } catch (Exception ignored) {
          // Media session still publishes to Bluetooth even if the notification is blocked.
        }
      }
    } finally {
      applyingState = false;
      lastApplyAt = SystemClock.elapsedRealtime();
    }
  }

  private void teardown() {
    applyingState = true;
    try {
      unregisterNoisy();
      abandonFocus();
      if (mediaSession != null) {
        mediaSession.setPlaybackState(new PlaybackStateCompat.Builder()
            .setActions(ACTIONS)
            .setState(PlaybackStateCompat.STATE_STOPPED, 0, 1f)
            .build());
        mediaSession.setActive(false);
      }
    } finally {
      applyingState = false;
      lastApplyAt = SystemClock.elapsedRealtime();
    }
    if (Build.VERSION.SDK_INT >= 24) {
      stopForeground(STOP_FOREGROUND_REMOVE);
    } else {
      stopForeground(true);
    }
    stopSelf();
  }

  private MediaMetadataCompat metadataFor(NowPlayingState state) {
    MediaMetadataCompat.Builder builder = new MediaMetadataCompat.Builder()
        .putString(MediaMetadataCompat.METADATA_KEY_TITLE, state.title)
        .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, state.artist)
        .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, state.album)
        .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_TITLE, state.title)
        .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_SUBTITLE, state.artist)
        .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_DESCRIPTION, state.album)
        .putString(MediaMetadataCompat.METADATA_KEY_MEDIA_ID, state.trackId > 0 ? String.valueOf(state.trackId) : "")
        .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, state.durationMs);
    if (artwork != null) {
      builder.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, artwork);
      builder.putBitmap(MediaMetadataCompat.METADATA_KEY_DISPLAY_ICON, artwork);
    }
    return builder.build();
  }

  private PlaybackStateCompat playbackStateFor(NowPlayingState state) {
    int playback = state.playing ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED;
    return new PlaybackStateCompat.Builder()
        .setActions(ACTIONS)
        .setState(playback, state.positionMs, state.playing ? 1f : 0f)
        .build();
  }

  private Notification notificationFor(NowPlayingState state) {
    Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
    PendingIntent contentIntent = launch == null
        ? null
        : PendingIntent.getActivity(this, 0, launch, pendingFlags());
    int playIcon = state.playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play;
    String playLabel = state.playing ? "Pause" : "Play";
    long playAction = state.playing ? PlaybackStateCompat.ACTION_PAUSE : PlaybackStateCompat.ACTION_PLAY;

    NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_stat_audiochest)
        .setContentTitle(state.title.isEmpty() ? "AudioChest" : state.title)
        .setContentText(subtitleFor(state))
        .setSubText(state.album)
        .setOngoing(state.playing)
        .setOnlyAlertOnce(true)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .setColor(0xFF7C3AED)
        .addAction(android.R.drawable.ic_media_previous, "Previous",
            MediaButtonReceiver.buildMediaButtonPendingIntent(this, PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS))
        .addAction(playIcon, playLabel,
            MediaButtonReceiver.buildMediaButtonPendingIntent(this, playAction))
        .addAction(android.R.drawable.ic_media_next, "Next",
            MediaButtonReceiver.buildMediaButtonPendingIntent(this, PlaybackStateCompat.ACTION_SKIP_TO_NEXT))
        .setStyle(new MediaStyle()
            .setMediaSession(mediaSession.getSessionToken())
            .setShowActionsInCompactView(0, 1, 2)
            .setShowCancelButton(true)
            .setCancelButtonIntent(
                MediaButtonReceiver.buildMediaButtonPendingIntent(this, PlaybackStateCompat.ACTION_STOP)));
    if (contentIntent != null) builder.setContentIntent(contentIntent);
    if (artwork != null) builder.setLargeIcon(artwork);
    return builder.build();
  }

  private static String subtitleFor(NowPlayingState state) {
    if (!state.artist.isEmpty() && !state.album.isEmpty()) return state.artist + " — " + state.album;
    if (!state.artist.isEmpty()) return state.artist;
    return state.album;
  }

  private void createChannel() {
    if (Build.VERSION.SDK_INT < 26) return;
    NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
    if (manager == null) return;
    NotificationChannel channel = new NotificationChannel(
        CHANNEL_ID,
        "Playback",
        NotificationManager.IMPORTANCE_LOW
    );
    channel.setDescription("Now playing controls");
    channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
    manager.createNotificationChannel(channel);
  }

  private Bitmap loadArtwork() {
    try {
      Drawable icon = getApplicationInfo().loadIcon(getPackageManager());
      int size = 256;
      Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
      Canvas canvas = new Canvas(bitmap);
      icon.setBounds(0, 0, size, size);
      icon.draw(canvas);
      return bitmap;
    } catch (Exception error) {
      return null;
    }
  }

  private void requestFocus() {
    if (audioManager == null || holdingFocus) return;
    focusRequestedAt = SystemClock.elapsedRealtime();
    try {
      int result;
      if (Build.VERSION.SDK_INT >= 26) {
        AudioFocusRequest request = (AudioFocusRequest) focusRequest;
        if (request == null) {
          request = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
              .setAudioAttributes(new AudioAttributes.Builder()
                  .setUsage(AudioAttributes.USAGE_MEDIA)
                  .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                  .build())
              .setOnAudioFocusChangeListener(focusListener)
              .setAcceptsDelayedFocusGain(true)
              .build();
          focusRequest = request;
        }
        result = audioManager.requestAudioFocus(request);
      } else {
        result = audioManager.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
      }
      holdingFocus = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
          || result == AudioManager.AUDIOFOCUS_REQUEST_DELAYED;
    } catch (Exception ignored) {
      // Focus is best-effort; the media session still advertises AudioChest to the car.
    }
  }

  private void abandonFocus() {
    if (audioManager == null || !holdingFocus) return;
    holdingFocus = false;
    try {
      if (Build.VERSION.SDK_INT >= 26 && focusRequest instanceof AudioFocusRequest) {
        audioManager.abandonAudioFocusRequest((AudioFocusRequest) focusRequest);
      } else {
        audioManager.abandonAudioFocus(focusListener);
      }
    } catch (Exception ignored) {
      // Ignore focus teardown failures.
    }
  }

  private void registerNoisy() {
    if (noisyRegistered) return;
    try {
      registerReceiver(noisyReceiver, new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY));
      noisyRegistered = true;
    } catch (Exception ignored) {
      noisyRegistered = false;
    }
  }

  private void unregisterNoisy() {
    if (!noisyRegistered) return;
    try {
      unregisterReceiver(noisyReceiver);
    } catch (Exception ignored) {
      // Already unregistered.
    }
    noisyRegistered = false;
  }

  private void registerOutputCallback() {
    if (audioManager == null || Build.VERSION.SDK_INT < 23) return;
    AudioDeviceCallback callback = new AudioDeviceCallback() {
      @Override
      public void onAudioDevicesAdded(AudioDeviceInfo[] addedDevices) {
        if (latest == null || !latest.active || !latest.interrupted) return;
        if (addedDevices == null) return;
        for (AudioDeviceInfo device : addedDevices) {
          if (isResumeOutput(device)) {
            emit("play", null);
            return;
          }
        }
      }
    };
    deviceCallback = callback;
    audioManager.registerAudioDeviceCallback(callback, new Handler(Looper.getMainLooper()));
  }

  private void unregisterOutputCallback() {
    if (audioManager == null || !(deviceCallback instanceof AudioDeviceCallback) || Build.VERSION.SDK_INT < 23) return;
    try {
      audioManager.unregisterAudioDeviceCallback((AudioDeviceCallback) deviceCallback);
    } catch (Exception ignored) {
      // Ignore callback teardown failures.
    }
    deviceCallback = null;
  }

  private static boolean isResumeOutput(AudioDeviceInfo device) {
    if (device == null || !device.isSink()) return false;
    int type = device.getType();
    return type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP
        || type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO
        || type == AudioDeviceInfo.TYPE_WIRED_HEADSET
        || type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES
        || type == AudioDeviceInfo.TYPE_USB_HEADSET
        || type == AudioDeviceInfo.TYPE_USB_DEVICE
        || type == AudioDeviceInfo.TYPE_BUS
        || type == AudioDeviceInfo.TYPE_AUX_LINE
        || type == AudioDeviceInfo.TYPE_HDMI
        || type == AudioDeviceInfo.TYPE_LINE_ANALOG
        || type == AudioDeviceInfo.TYPE_LINE_DIGITAL;
  }

  private static int pendingFlags() {
    int flags = PendingIntent.FLAG_UPDATE_CURRENT;
    if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
    return flags;
  }
}
