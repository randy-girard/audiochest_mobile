import { IonButton, IonIcon } from '@ionic/react';
import { pause, play, playSkipBack, playSkipForward, repeat, shuffle } from 'ionicons/icons';
import React, { useLayoutEffect, useState } from 'react';
import { usePlayer } from '../PlayerContext';
import { formatTime } from '../utils';

function repeatLabel(mode: 'off' | 'all' | 'one'): string {
  if (mode === 'one') return 'Repeat this song';
  if (mode === 'all') return 'Repeat all songs';
  return 'Repeat off';
}

const PlayerBar: React.FC = () => {
  const player = usePlayer();
  const [preview, setPreview] = useState<number | null>(null);
  const [tabOffset, setTabOffset] = useState<number | null>(null);

  useLayoutEffect(() => {
    let resizeObserver: ResizeObserver | null = null;
    let mutationObserver: MutationObserver | null = null;
    let watched: Element | null = null;

    const readHeight = (bar: Element) => {
      const height = bar.getBoundingClientRect().height;
      if (height > 0) setTabOffset(height);
    };

    const watch = (bar: Element) => {
      if (watched === bar) {
        readHeight(bar);
        return;
      }
      watched = bar;
      if (resizeObserver) resizeObserver.disconnect();
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => readHeight(bar));
        resizeObserver.observe(bar);
      }
      readHeight(bar);
    };

    const findBar = () => {
      const bar = document.querySelector('ion-tab-bar');
      if (!bar) return false;
      if (mutationObserver) {
        mutationObserver.disconnect();
        mutationObserver = null;
      }
      watch(bar);
      return true;
    };

    if (!findBar()) {
      mutationObserver = new MutationObserver(() => { findBar(); });
      mutationObserver.observe(document.body, { childList: true, subtree: true });
    }

    const timers = [50, 250, 800].map((ms) => window.setTimeout(() => { findBar(); }, ms));

    const onViewport = () => {
      const bar = document.querySelector('ion-tab-bar');
      if (bar) readHeight(bar);
    };
    window.addEventListener('resize', onViewport);
    window.addEventListener('orientationchange', onViewport);
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      if (resizeObserver) resizeObserver.disconnect();
      if (mutationObserver) mutationObserver.disconnect();
      window.removeEventListener('resize', onViewport);
      window.removeEventListener('orientationchange', onViewport);
    };
  }, []);

  if (!player.current) return null;

  const max = player.duration > 0 ? player.duration : 1;
  const value = preview === null ? player.currentTime : preview;
  const repeatOn = player.repeat !== 'off';

  const finishSeek = (seconds: number) => {
    player.seek(seconds);
    setPreview(null);
  };

  return (
    <div className="player-bar" style={tabOffset === null ? undefined : { bottom: tabOffset }}>
      <div className="player-bar-inner">
        <div className="player-title">{player.title}</div>
        <div className="player-progress">
          <span className="player-time">{formatTime(value)}</span>
          <input
            className="player-seek"
            type="range"
            min={0}
            max={max}
            step={0.25}
            value={value}
            disabled={player.duration <= 0}
            aria-label="Seek"
            onChange={(event) => setPreview(Number(event.target.value))}
            onMouseUp={(event) => finishSeek(Number((event.target as HTMLInputElement).value))}
            onTouchEnd={(event) => finishSeek(Number((event.target as HTMLInputElement).value))}
            onKeyUp={(event) => finishSeek(Number((event.target as HTMLInputElement).value))}
          />
          <span className="player-time">{formatTime(player.duration)}</span>
        </div>
        <div className="player-controls">
          <IonButton
            fill="clear"
            className={player.shuffle ? 'player-mode-on' : undefined}
            color={player.shuffle ? 'primary' : 'medium'}
            onClick={player.toggleShuffle}
            aria-label={player.shuffle ? 'Turn shuffle off' : 'Turn shuffle on'}
            aria-pressed={player.shuffle}
          >
            <IonIcon slot="icon-only" icon={shuffle} />
          </IonButton>
          <IonButton fill="clear" onClick={player.prev} aria-label="Previous">
            <IonIcon slot="icon-only" icon={playSkipBack} />
          </IonButton>
          <IonButton fill="clear" onClick={player.toggle} aria-label={player.playing ? 'Pause' : 'Play'}>
            <IonIcon slot="icon-only" icon={player.playing ? pause : play} />
          </IonButton>
          <IonButton fill="clear" onClick={player.next} aria-label="Next">
            <IonIcon slot="icon-only" icon={playSkipForward} />
          </IonButton>
          <IonButton
            fill="clear"
            className={repeatOn ? 'player-mode-on player-repeat' : 'player-repeat'}
            color={repeatOn ? 'primary' : 'medium'}
            onClick={player.cycleRepeat}
            aria-label={repeatLabel(player.repeat)}
            aria-pressed={repeatOn}
          >
            <IonIcon slot="icon-only" icon={repeat} />
            {player.repeat === 'one' ? <span className="player-repeat-badge">1</span> : null}
          </IonButton>
        </div>
      </div>
    </div>
  );
};

export default PlayerBar;
