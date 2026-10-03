// jsdom has `<dialog>` but not `showModal()` / `close()`; this gives specs the parts the app uses:
// the `open` attribute, and the `close` event when it is closed.
const proto = HTMLDialogElement.prototype;
proto.showModal ??= function (this: HTMLDialogElement) {
  this.setAttribute('open', '');
};
proto.close ??= function (this: HTMLDialogElement) {
  this.removeAttribute('open');
  this.dispatchEvent(new Event('close'));
};
