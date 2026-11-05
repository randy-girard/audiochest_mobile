// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom/extend-expect';

// Mock matchmedia
window.matchMedia = window.matchMedia || function() {
  return {
    matches: false,
    addListener: function() {},
    removeListener: function() {},
    addEventListener: function() {},
    removeEventListener: function() {},
    dispatchEvent: function() { return false; }
  };
};

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(window as any).ResizeObserver = window.ResizeObserver || ResizeObserverMock;
(window as any).IntersectionObserver = window.IntersectionObserver || class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

Object.defineProperty(window.HTMLMediaElement.prototype, 'play', {
  configurable: true,
  value: () => Promise.resolve()
});
Object.defineProperty(window.HTMLMediaElement.prototype, 'currentTime', {
  configurable: true,
  writable: true,
  value: 0
});
Object.defineProperty(window.HTMLMediaElement.prototype, 'duration', {
  configurable: true,
  writable: true,
  value: 0
});
Object.defineProperty(window.HTMLMediaElement.prototype, 'pause', {
  configurable: true,
  value: () => undefined
});
Object.defineProperty(window.HTMLMediaElement.prototype, 'load', {
  configurable: true,
  value: () => undefined
});
