import { html } from "lit";
import { LightElement } from "../../ui/base.ts";

/** Midlertidig plassholder – implementeres i et senere steg. */
class FormStub extends LightElement {
  protected override render() {
    return html`<div class="laster" role="status">Inspeksjonsskjemaet kommer i steg 3.</div>`;
  }
}
customElements.define("svv-inspection-form", FormStub);
