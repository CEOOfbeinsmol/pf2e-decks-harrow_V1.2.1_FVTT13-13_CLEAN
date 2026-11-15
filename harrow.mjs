import * as HARROW from "./module/const.mjs";
import {handleImportOptions, renderAdventureImporter} from "./module/importer.mjs";
import HarrowReadingSheet from "./module/reading-sheet.mjs";


/* -------------------------------------------- */
/*  Game Initialization                         */
/* -------------------------------------------- */

Hooks.on("init", () => {
  globalThis.harrow = game.modules.get(HARROW.MODULE_ID);
  console.log(`Harrow | Initializing Harrow Module`);

  // Constants
  harrow.CONST = HARROW;

  // Register settings
  game.settings.register(HARROW.MODULE_ID, "startup", {
    name: "One-Time Startup Prompt",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  // Websocket Events
  harrow.socketId = `module.${HARROW.MODULE_ID}`;
  game.socket.on(harrow.socketId, _handleHarrowSocketEvent);

  // Sheet Registration
  foundry.documents.collections.CardStacks.registerSheet(HARROW.MODULE_ID, HarrowReadingSheet, {
    label: "HARROW.ReadingSheet",
    makeDefault: false,
    types: ["hand"],
    themes: null
  });

  // Exposed API
  harrow.api = {
    createReading,
    HarrowReadingSheet
  }
});

/* -------------------------------------------- */
/*  Initialize Localization                     */
/* -------------------------------------------- */

Hooks.on("i18nInit", () => {
  const toLocalize = ["ALIGNMENTS", "SUITS", "MATCH_TYPES", "POSITIONS"];
  for ( const k of toLocalize ) {
    const config = HARROW[k];
    for ( const [k, v] of Object.entries(config) ) {
      if ( typeof v === "string" ) config[k] = game.i18n.localize(v);
      else if ( typeof v?.label === "string" ) config[k].label = game.i18n.localize(v.label);
    }
    Object.freeze(config);
  }
});

/* -------------------------------------------- */
/*  Cards Directory Context                     */
/* -------------------------------------------- */

Hooks.on("getCardsContextOptions", (_html, options) => {
  const name = game.i18n.localize("HARROW.NewReading");
  options.unshift(      {
    name,
    icon: '<i class="fa-solid fa-cards"></i>',
    condition: li => game.user.isGM && (li.dataset.entryId === HARROW.DECK_ID),
    callback: async () => {
      const reading = await createReading({name});
      reading.sheet.render(true);
    }
  },);
});

/* -------------------------------------------- */
/*  Application Classes                         */
/* -------------------------------------------- */

Hooks.on("renderJournalSheet", (app, html) => {
  html = html instanceof HTMLElement ? html : html[0];
  if ( [HARROW.JOURNAL_RULES_ID, HARROW.JOURNAL_CARDS_ID].includes(app.document.id) ) html.classList.add("harrow");
});

Hooks.on("renderCardsConfig", (app, html) => {
  if ( app.document.id === HARROW.DECK_ID ) html.classList.add("harrow", "themed", "theme-light");
});

Hooks.on("renderAdventureImporter", renderAdventureImporter);
Hooks.on("renderAdventureImporterV2", renderAdventureImporter);
Hooks.on("importAdventure", handleImportOptions);

/* -------------------------------------------- */
/*  Web Socket Actions                          */
/* -------------------------------------------- */

/**
 * Handle special events passed through the harrow module websocket channel.
 * @param {{action: string, data: object}} message     Socket event data
 * @private
 */
function _handleHarrowSocketEvent(message) {
  let reading;
  switch ( message.action ) {
    case "playSound":
      reading = game.cards.get(message.data.readingId);
      if ( !reading?.sheet?.rendered ) return;
      return foundry.audio.AudioHelper.play(message.data);
    case "requestCard":
      reading = game.cards.get(message.data.readingId);
      return reading.sheet.handleCardRequest(message.data);
    case "showReading":
      reading = game.cards.get(message.data.readingId);
      return reading.sheet.render({force: true, temporaryObserver: true});
  }
}

/* -------------------------------------------- */
/*  API Methods                                 */
/* -------------------------------------------- */

/**
 * Create a new Harrow reading as a Cards document with the "hand" type.
 * @param {object} documentData     Additional document data to be included in the creation request
 * @returns {Promise<Cards>}        The created Cards document
 */
async function createReading(documentData={}) {
  const createData = foundry.utils.mergeObject({
    name: game.i18n.localize("HARROW.NewReading"),
    type: "hand",
    img: HARROW.SUIT_ICONS.any,
    flags: {
      core: {
        sheetClass: `${HARROW.MODULE_ID}.HarrowReadingSheet`
      },
      [HARROW.MODULE_ID]: {
        step: HARROW.STEPS.PREPARE
      }
    }
  }, documentData);
  return Cards.create(createData);
}
