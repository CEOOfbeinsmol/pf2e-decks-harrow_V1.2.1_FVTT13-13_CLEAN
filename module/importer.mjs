import {MODULE_ID} from "./const.mjs";

const importOptions = {
  activateScene: {
    label: "Activate Initial Scene",
    default: true,
    handler: activateScene,
    sceneId: "HarrowReading000"
  },
  displayJournal: {
    label: "Display Rulebook Journal Entry",
    default: true,
    handler: displayJournal,
    entryId: "HarrowRulebook00"
  }
}

/* -------------------------------------------- */

/**
 * Add HTML options to the importer form
 * @returns {string}
 */
export function renderAdventureImporter(app, html) {
  if ( app.adventure.pack !== `${MODULE_ID}.harrow` ) return;
  html = html instanceof HTMLElement ? html : html[0];

  // Format options HTML
  let options = `<section class="import-controls"><h2>Options</h2>`;
  for ( const [name, option] of Object.entries(importOptions) ) {
    options += `<div class="form-group">
        <label class="checkbox">
            <input type="checkbox" name="${name}" ${option.default ? "checked" : ""}>
            ${option.label}
        </label>
    </div>`;
  }
  options += `</section>`;

  // Insert options
  html.classList.add("harrow", "themed", "theme-light");
  html.querySelector(".adventure-contents").insertAdjacentHTML("beforeend", options);
  app.setPosition();
}

/* -------------------------------------------- */

/**
 * Handle options supported by the importer
 * @param {Adventure} adventure
 * @param {object} formData
 * @param {object} created
 * @param {object} updated
 * @returns {Promise<void>}
 */
export async function handleImportOptions(adventure, formData, created, updated) {
  if ( adventure.pack !== `${MODULE_ID}.harrow` ) return;
  for ( let [name, option] of Object.entries(importOptions) ) {
    if ( formData[name] ) await option.handler(adventure, option);
  }
}

/* -------------------------------------------- */

/**
 * Activate an initial scene
 * @param {Adventure} adventure   The adventure being imported
 * @param {object} option         The configured import option
 * @returns {Promise<*>}
 */
export async function activateScene(adventure, option) {
  const scene = game.scenes.get(option.sceneId);
  return scene?.activate();
}

/* -------------------------------------------- */

/**
 * Display an initial journal entry
 * @param {Adventure} adventure     The adventure being imported
 * @param {object} option           The configured import option
 * @returns {Promise<*>}
 */
export async function displayJournal(adventure, option) {
  const journal = game.journal.get(option.entryId);
  journal?.sheet.render(true);
}
