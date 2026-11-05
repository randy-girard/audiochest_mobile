import { centeredScrollTopFromRects, scrollPlayingTrackIntoView, visiblePlayingRow } from './trackScroll';

describe('visiblePlayingRow', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('finds the highlighted row on a visible page', () => {
    document.body.innerHTML = `
      <div class="ion-page">
        <div class="track-list">
          <div data-playing-track="true" id="now"></div>
        </div>
      </div>
    `;
    const list = document.querySelector('.track-list');
    expect(visiblePlayingRow(list)?.id).toBe('now');
  });

  it('does not scroll hidden tab pages', () => {
    document.body.innerHTML = `
      <div class="ion-page ion-page-hidden">
        <div class="track-list">
          <div data-playing-track="true" id="now"></div>
        </div>
      </div>
    `;
    expect(visiblePlayingRow(document.querySelector('.track-list'))).toBeNull();
  });

  it('does not scroll aria-hidden pages', () => {
    document.body.innerHTML = `
      <div class="ion-page" aria-hidden="true">
        <div class="track-list">
          <div data-playing-track="true" id="now"></div>
        </div>
      </div>
    `;
    expect(visiblePlayingRow(document.querySelector('.track-list'))).toBeNull();
  });

  it('returns null when the current song is not in this list', () => {
    document.body.innerHTML = `<div class="track-list"><div id="other"></div></div>`;
    expect(visiblePlayingRow(document.querySelector('.track-list'))).toBeNull();
  });
});

describe('centeredScrollTopFromRects', () => {
  it('centers the playing row in the playlist viewport', () => {
    expect(centeredScrollTopFromRects(0, 800, 56, 0, 400, 2000)).toBe(628);
  });

  it('clamps to the start and end of the list', () => {
    expect(centeredScrollTopFromRects(0, 10, 40, 0, 400, 500)).toBe(0);
    expect(centeredScrollTopFromRects(0, 1800, 40, 0, 400, 2000)).toBe(1600);
  });
});

describe('scrollPlayingTrackIntoView', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('does not scroll the document, which jumps Ionic pages to the top', async () => {
    document.body.innerHTML = `
      <div class="ion-page">
        <div class="track-list">
          <div data-playing-track="true" id="now"></div>
        </div>
      </div>
    `;
    const row = document.getElementById('now') as HTMLElement;
    row.scrollIntoView = () => {
      throw new Error('should not scroll the document');
    };
    await expect(scrollPlayingTrackIntoView(document.querySelector('.track-list') as HTMLElement)).resolves.toBe(false);
  });
});
