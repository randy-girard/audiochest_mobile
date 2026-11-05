export function visiblePlayingRow(list: ParentNode | null): HTMLElement | null {
  if (!list) return null;
  const row = list.querySelector('[data-playing-track="true"]') as HTMLElement | null;
  if (!row) return null;
  const page = row.closest('ion-page, .ion-page') as HTMLElement | null;
  if (page) {
    if (page.classList.contains('ion-page-hidden')) return null;
    if (page.getAttribute('aria-hidden') === 'true') return null;
  }
  return row;
}

export function centeredScrollTopFromRects(
  currentScrollTop: number,
  rowTop: number,
  rowHeight: number,
  viewTop: number,
  viewHeight: number,
  scrollHeight: number,
): number {
  const target = currentScrollTop + (rowTop - viewTop) - viewHeight / 2 + rowHeight / 2;
  const max = Math.max(0, scrollHeight - viewHeight);
  return Math.max(0, Math.min(target, max));
}

interface IonScrollContent {
  getScrollElement?: () => Promise<HTMLElement>;
  scrollToPoint?: (x: number | null, y: number, duration?: number) => Promise<void>;
}

export async function scrollPlayingTrackIntoView(list: HTMLElement | null): Promise<boolean> {
  const row = visiblePlayingRow(list);
  if (!row) return false;
  const content = row.closest('ion-content') as (HTMLElement & IonScrollContent) | null;
  if (content && typeof content.getScrollElement === 'function' && typeof content.scrollToPoint === 'function') {
    const scrollEl = await content.getScrollElement();
    const rowRect = row.getBoundingClientRect();
    const viewRect = scrollEl.getBoundingClientRect();
    const top = centeredScrollTopFromRects(
      scrollEl.scrollTop,
      rowRect.top,
      rowRect.height,
      viewRect.top,
      scrollEl.clientHeight,
      scrollEl.scrollHeight,
    );
    if (Math.abs(top - scrollEl.scrollTop) < 8) return true;
    await content.scrollToPoint(0, top, 350);
    return true;
  }
  return false;
}

export function schedulePlayingTrackScroll(list: HTMLElement | null): () => void {
  if (!list) return () => undefined;
  let cancelled = false;
  const run = () => {
    if (cancelled) return;
    void scrollPlayingTrackIntoView(list);
  };
  const timers = [0, 160, 450].map((ms) => window.setTimeout(run, ms));
  const page = list.closest('ion-page, .ion-page');
  let observer: IntersectionObserver | null = null;
  if (page && typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting && entry.intersectionRatio > 0)) run();
    });
    observer.observe(page);
  }
  return () => {
    cancelled = true;
    timers.forEach((id) => window.clearTimeout(id));
    if (observer) observer.disconnect();
  };
}
