import { html } from "lit";
import { LightElement } from "../../ui/base.ts";

/** Midlertidig plassholder – implementeres i et senere steg. */
class FieldMapStub extends LightElement {
  protected override render() {
    return html`<div class="laster" role="status">Feltkartet kommer i steg 3.</div>`;
  }
}
customElements.define("svv-field-map", FieldMapStub);
