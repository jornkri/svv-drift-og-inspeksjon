import { html } from "lit";
import { lagreNavn, lagretNavn } from "../auth/navn.ts";
import { LightElement } from "./base.ts";

/**
 * Offentlig pilot uten innlogging: spør om navnet som skal stå på inspeksjoner og oppgaver.
 * Navnet lagres i nettleseren og kan endres fra brukermenyen.
 */
export class SvvNavnDialog extends LightElement {
  protected override firstUpdated(): void {
    this.querySelector<HTMLDialogElement>("dialog")?.showModal();
    this.querySelector<HTMLInputElement>("input")?.focus();
  }

  private lagre(e: Event) {
    e.preventDefault();
    const navn = this.querySelector<HTMLInputElement>("input")?.value.trim();
    if (!navn) return;
    lagreNavn(navn);
    // Brukeren leses ved oppstart; last på nytt så navnet brukes overalt
    location.reload();
  }

  private lukk() {
    this.querySelector<HTMLDialogElement>("dialog")?.close();
    this.remove();
  }

  protected override render() {
    return html`<dialog class="navndialog" aria-labelledby="navndialog-tittel" @cancel=${() => this.lukk()}>
      <form @submit=${(e: Event) => this.lagre(e)}>
        <h2 id="navndialog-tittel">Hvem inspiserer?</h2>
        <p>Dette er en åpen pilot uten innlogging. Navnet ditt lagres på inspeksjoner og oppgaver du registrerer, og huskes i denne nettleseren.</p>
        <label class="felt">
          <span class="felt__etikett">Navn</span>
          <input type="text" name="navn" autocomplete="name" required .value=${lagretNavn() ?? ""} />
        </label>
        <div class="navndialog__knapper">
          <button type="button" class="knapp knapp--sekundar" @click=${() => this.lukk()}>Senere</button>
          <button type="submit" class="knapp knapp--primar">Fortsett</button>
        </div>
      </form>
    </dialog>`;
  }
}

customElements.define("svv-navn-dialog", SvvNavnDialog);
