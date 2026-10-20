// Browser APIs that jsdom (Jest's fake browser) doesn't provide, needed before app modules load
import { TextEncoder, TextDecoder } from 'node:util';

// react-router uses these
globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

// The landing page uses IntersectionObserver for scroll animations
globalThis.IntersectionObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
};

// <dialog>.showModal()/close() — the minimal behaviour the Modal component uses
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function close() {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}

window.scrollTo = () => {};
