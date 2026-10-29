import { html } from "lit";
import { LightElement } from "../../ui/base.ts";

/** Midlertidig plassholder – implementeres i et senere steg. */
class ToolsStub extends LightElement {
  protected override render() {
    return html`<div class="laster" role="status">Verktøy kommer i steg 3.</div>`;
  }
}
class MeStub extends LightElement {
  protected override render() {
    return html`<div class="laster" role="status">Meg kommer i steg 3.</div>`;
  }
}
customElements.define("svv-field-tools", ToolsStub);
customElements.define("svv-field-me", MeStub);
