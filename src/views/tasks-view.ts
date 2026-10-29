import { html } from "lit";
import { LightElement } from "../ui/base.ts";

/** Midlertidig plassholder – implementeres i et senere steg. */
class TasksStub extends LightElement {
  protected override render() {
    return html`<div class="laster" role="status">Oppgaver kommer i steg 4.</div>`;
  }
}
customElements.define("svv-tasks-view", TasksStub);
