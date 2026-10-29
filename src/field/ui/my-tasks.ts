import { html } from "lit";
import { LightElement } from "../../ui/base.ts";

/** Midlertidig plassholder – implementeres i et senere steg. */
class MyTasksStub extends LightElement {
  protected override render() {
    return html`<div class="laster" role="status">Mine oppgaver kommer i steg 4.</div>`;
  }
}
customElements.define("svv-my-tasks", MyTasksStub);
