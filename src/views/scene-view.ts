import { html } from "lit";
import { LightElement } from "../ui/base.ts";

/** Midlertidig plassholder – implementeres i et senere steg. */
class SceneStub extends LightElement {
  protected override render() {
    return html`<div class="laster" role="status">3D-scenen kommer i steg 5.</div>`;
  }
}
customElements.define("svv-scene-view", SceneStub);
