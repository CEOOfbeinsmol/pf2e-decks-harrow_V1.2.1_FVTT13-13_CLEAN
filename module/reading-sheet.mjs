import * as HARROW from "./const.mjs";


/**
 * @typedef HarrowMatch
 * @property {string} position
 * @property {string} alignment
 * @property {string} type
 * @property {boolean} misaligned
 * @property {string} label
 * @property {string} icon
 */

export default class HarrowReadingSheet extends foundry.applications.sheets.CardsConfig {
  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["harrow-reading", "themed", "theme-light"],
    viewPermission: CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED,
    window: {
      controls: [{icon: "fa-solid fa-eye", label: "JOURNAL.ActionShow", action: "showDialog"}]
    },
    position: {width: 740},
    form: {submitOnChange: true},
    actions: {
      addParticipant: HarrowReadingSheet.#onAddParticipant,
      beginReading: HarrowReadingSheet.#onBeginReading,
      chooseAll: HarrowReadingSheet.#onChooseAll,
      controlCard: HarrowReadingSheet.#onControlCard,
      hideOverlay: HarrowReadingSheet.#onHideOverlay,
      interpretCard: HarrowReadingSheet.#onInterpretCard,
      removeParticipant: HarrowReadingSheet.#onRemoveParticipant,
      requestCard: HarrowReadingSheet.#onRequestCard,
      reset: HarrowReadingSheet.#onReset,
      revealAll: HarrowReadingSheet.#onRevealAll,
      viewDeck: HarrowReadingSheet.#onViewDeck,
      viewRules: HarrowReadingSheet.#onViewRules,
      viewSpread: HarrowReadingSheet.#onViewSpread
    }
  };

  static PARTS = {
    header: {template: `modules/${HARROW.MODULE_ID}/templates/header.hbs`},
    sidebar: {template: `modules/${HARROW.MODULE_ID}/templates/sidebar.hbs`},
    reading: {template: `modules/${HARROW.MODULE_ID}/templates/reading.hbs`, scrollable: [""]},
    footer: {template: "templates/generic/form-footer.hbs"}
  };

  /* -------------------------------------------- */

  /** @override */
  get title() {
    return `${game.i18n.localize("HARROW.Harrow")}: ${this.document.name}`;
  }

  /**
   * The step of the reading process.
   * @type {number}
   */
  #step;

  /**
   * The chosen suit of the reading.
   * @type {string}
   */
  #suit;

  /**
   * Current cards organized by position
   * @type {Object<Card>}
   */
  #cards;

  /**
   * Current actors participating in the drawing
   * @type {Array<{actor: Actor, card: Card, revealed: boolean}>}
   */
  #participants;

  /**
   * The card that is currently displayed as the full-size overlay
   * @type {Card|null}
   */
  #overlay = null;

  /**
   * Is the current
   * @type {boolean}
   */
  #temporaryObserver = false;

  /**
   * Drop handling for during the PREPARE phase
   * @type {DragDrop}
   */
  #dragDrop = new foundry.applications.ux.DragDrop.implementation({
    dropSelector: "[data-droppable]",
    permissions: {
      dragstart: () => false,
      drop: () => this.isEditable
    },
    callbacks: {
      drop: this._onDrop.bind(this)
    }
  });

  /* -------------------------------------------- */
  /*  Data Preparation and Rendering              */
  /* -------------------------------------------- */

  /** @override */
  async _preRender(context, options) {
    if ( options.temporaryObserver ) this.#temporaryObserver = true;
    return super._preRender(context, options)
  }

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    if ( !game.cards.has(HARROW.DECK_ID) ) {
      ui.notifications.error(`The source Harrow deck is missing from this World and must be re-imported!`);
    }

    // Apply document flags to sheet attributes
    const flags = this.document.flags[HARROW.MODULE_ID] ?? {};
    this.#suit = flags.suit || null;
    this.#step = flags.step ?? HARROW.STEPS.PREPARE;
    if ( !this.#suit ) this.#step = HARROW.STEPS.PREPARE;
    this.#overlay = flags.overlay ? this.document.cards.get(flags.overlay) : null;

    // Configure rendering data
    const stepConfig = this.#getStep();
    this.#cards = this.#prepareCards();
    this.#participants = this.#prepareParticipants(stepConfig.canDrawCard);
    const nCards = Object.keys(this.#cards).length;

    // Return render context
    return Object.assign(context, {
      overlay: this.#prepareOverlay(),
      participants: this.#participants,
      spread: this.#step === HARROW.STEPS.CHOOSE ? this.#prepareChoosingSpread() : this.#prepareReadingSpread(),
      step: stepConfig,
      suit: this.#suit,
      suitLocked: this.#suit && nCards,
      suits: HARROW.SUITS,
      hidden: !!this.#overlay,
      participantCardText: this.#step === HARROW.STEPS.CHOOSE ? "HARROW.ACTIONS.ChooseCard" : "HARROW.SubjectCard"
    })
  }

  async _preparePartContext(partId, context, options) {
    const partContext = await super._preparePartContext(partId, context, options);
    if ( partId === "footer" ) {
      const step = context.step;
      partContext.buttons = [
        {type: "button", icon: "fa-solid fa-user-plus", label: "HARROW.AddParticipant", action: "addParticipant",
          disabled: !step.canAddParticipant},
        {type: "button", icon: "fa-solid fa-arrow-rotate-left", label: "HARROW.Reset", action: "reset"},
        {type: "button", ...step}
      ];
    }
    return partContext;
  }

  /* -------------------------------------------- */

  /** @override */
  _tearDown(options) {
    super._tearDown(options);
    this.#temporaryObserver = false;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _canUserView(user) {
    if ( this.#temporaryObserver ) return true;
    return super._canUserView(user);
  }

  /* -------------------------------------------- */

  /**
   * @typedef {Object} HarrowStep
   * @property {string} label
   * @property {string} icon
   * @property {string} [hint]
   * @property {boolean} [canAddParticipant]
   * @property {boolean} [canDrawCard]
   * @property {boolean} [disabled]
   */

  /**
   * Identify the current reading step and its associated metadata.
   * @returns {HarrowStep}
   */
  #getStep() {

    // Overlay Card
    if ( this.#overlay ) {
      return {
        label: "HARROW.ACTIONS.Interpret",
        action: "interpretCard",
        icon: "fa-solid fa-book-open",
        canAddParticipant: this.#step < HARROW.STEPS.SPREAD,
        canDrawCard: false
      }
    }

    // PREPARE
    if ( this.#step === HARROW.STEPS.PREPARE ) {
      if ( !this.#suit ) return {
        label: "HARROW.STEP.SUIT",
        icon: "fa-solid fa-cards",
        canAddParticipant: true,
        canDrawCard: false,
        disabled: true
      };
      return {
        label: "HARROW.STEP.BEGIN",
        action: "beginReading",
        hint: "HARROW.STEP.PREPAREHint",
        icon: "fa-solid fa-arrow-right",
        canAddParticipant: true,
        canDrawCard: false
      };
    }

    // CHOOSE
    if ( this.#step === HARROW.STEPS.CHOOSE ) {
      const participants = this.document.getFlag(HARROW.MODULE_ID, "participants") || [];
      if ( participants.some(p => !p.revealed) ) return {
        label: "HARROW.ACTIONS.ChooseSubjects",
        action: "chooseAll",
        icon: "fa-solid fa-cards",
        canAddParticipant: true,
        canDrawCard: true
      };
      else return {
        label: "HARROW.STEP.SPREAD",
        icon: "fa-solid fa-arrow-right",
        action: "viewSpread",
        canAddParticipant: true,
        canDrawCard: true // for overlay
      };
    }

    // SPREAD
    else if ( this.#step === HARROW.STEPS.SPREAD ) {
      return {
        label: "HARROW.ACTIONS.Reveal",
        icon: "fa-solid fa-cards",
        action: "revealAll",
        canAddParticipant: false,
        canDrawCard: true
      }
    }

    // INTERPRET
    else return {
      label: "HARROW.STEP.COMPLETE",
      icon: "fa-solid fa-check",
      disabled: true,
      canAddParticipant: false,
      canDrawCard: true // for overlay
    }
  }

  /* -------------------------------------------- */

  /**
   * Organize the cards in this hand by allocating them to the spread positions.
   * @returns {Object<Card>}
   */
  #prepareCards() {
    const cards = {};
    for ( const card of this.document.cards ) {
      const {position} = card.flags[HARROW.MODULE_ID] ?? {};
      if ( !position || !(position in HARROW.POSITIONS) ) continue; // Skip cards which do not have a spread position
      cards[position] = card;
    }
    return cards;
  }

  /* -------------------------------------------- */

  /**
   * Prepare the spread used during the choosing phase.
   */
  #prepareChoosingSpread() {
    const deck = game.cards.get(HARROW.DECK_ID);
    return HARROW.SPREAD_POSITIONS.map(position => {
      const label = HARROW.POSITIONS[position];
      const participant = this.#participants.find(p => p.position === position);
      const card = participant?.card || null;
      return {
        position,
        hasCard: true,
        cardId: card?.id,
        label,
        img: card?.faces[0].img || deck.img,
        imgClass: "",
        tooltip: card && this.isEditable ? `${card.name}: ${label}` : label,
        color: participant?.color
      }
    });
  }

  /* -------------------------------------------- */

  /**
   * Prepare card data for the spread that should be displayed in the UI.
   * @returns {{position: string, label: string, card: Card, tooltip: string, imgClass: string, color: string}[]}
   */
  #prepareReadingSpread() {
    const canSeeCards = (this.#step > HARROW.STEPS.PREPARE) || this.isEditable;

    // Map cards to positions
    const positions = {};
    for ( const card of this.document.cards ) {
      const {position} = card.flags[HARROW.MODULE_ID] || {};
      if ( position && canSeeCards ) positions[position] = card;
    }

    // Prepare positions array
    return HARROW.SPREAD_POSITIONS.map(position => {
      const card = positions[position];
      if ( !card ) return {position, hasCard: false, label: HARROW.POSITIONS[position]};
      const participant = this.#participants.find(p => p.card?.id === card.id);
      const {alignment} = card.flags[HARROW.MODULE_ID];
      const isFaceUp = Number.isNumeric(card.face);
      const match = isFaceUp ? HarrowReadingSheet.#getMatch(position, alignment) : {type: "none"};
      return {
        position,
        match,
        hasCard: !!card,
        cardId: card.id,
        img: card.img,
        imgClass: participant && isFaceUp ? "active" : "",
        tooltip: this.#getTooltip(card, match),
        matchIcons: isFaceUp && this.document.isOwner ? this.#getMatchIcons(participant, match) : [],
        color: participant?.color
      }
    });
  }

  /* -------------------------------------------- */

  /**
   * Prepare data for a single card displayed in overlay mode.
   * @returns {{card: Card, img: string, tooltip: string, matchIcons: object[]}}
   */
  #prepareOverlay() {
    if ( !this.#overlay ) return null;
    const participant = this.#participants.find(p => p.card === this.#overlay);
    const {position, alignment} = this.#overlay.flags[HARROW.MODULE_ID];

    // Basic display for Choosing cards
    let tooltip = this.#overlay.name;
    let matchIcons = [];

    // Advanced display for Spread cards
    if ( this.#step > HARROW.STEPS.CHOOSE ) {
      const match = HarrowReadingSheet.#getMatch(position, alignment);
      matchIcons = this.#getMatchIcons(participant, match);
      tooltip = this.#getTooltip(this.#overlay, match)
    }

    // Return overlay data
    return {card: this.#overlay, img: this.#overlay.faces[0].img, tooltip, matchIcons};
  }

  /* -------------------------------------------- */

  /**
   * Identify the type of match in HARROW.MATCH_TYPES for a position and alignment tuple.
   * @param {string} position     A card position in the spread
   * @param {string} alignment    The natural alignment of a card
   * @returns {HarrowMatch}       Match details
   */
  static #getMatch(position, alignment) {
    const misaligned = ((position[1] === "G") && (alignment[1] === "E"))
      || ((position[1] === "E") && (alignment[1] === "G"));
    const match = {position, alignment, misaligned};
    if ( position === alignment ) return Object.assign(match, {
      type: "true",
      icon: "fa-solid fa-star",
      label: HARROW.MATCH_TYPES.true
    });
    const opposite = HARROW.OPPOSITE_ALIGNMENTS[alignment];
    if ( position === opposite ) return Object.assign(match, {
      type: "opposite",
      label: HARROW.MATCH_TYPES.opposite,
      icon: "fa-solid fa-eclipse"
    });
    if ( (position[0] === alignment[0]) || (position[1] === alignment[1]) ) return Object.assign(match, {
      type: "partial",
      label: HARROW.MATCH_TYPES.partial,
      icon: "fa-regular fa-star-half-stroke"
    });
    return Object.assign(match, {
      type: "none",
      label: HARROW.MATCH_TYPES.none,
      icon: "fa-solid fa-ban",
    });
  }

  /* -------------------------------------------- */

  /**
   * Prepare a string tooltip for the displayed card.
   * @param {Card} card             The card being interpreted
   * @param {HarrowMatch} match     The card match
   * @returns {string}              A combined tooltip
   */
  #getTooltip(card, match) {
    return [
      card && (card.face === 0) ? card.name : "",
      this.document.isOwner ? HARROW.POSITIONS[match.position] : "",
      this.document.isOwner && (match.type !== "none") ? match.label : ""
    ].filterJoin(" - ")
  }

  /* -------------------------------------------- */

  /**
   * Prepare an array of match icons used to guide card interpretation.
   * @param {HarrowParticipant} participant     The reading participant
   * @param {HarrowMatch} match                 The card match
   * @returns {Array<{icon: string, label: string}>}
   */
  #getMatchIcons(participant, match) {
    return [
      participant ? {
        label: `${participant.actor.name}: ${game.i18n.localize("HARROW.SubjectCard")}`,
        icon: "fa-solid fa-user"
      } : null,
      match.type !== "none" ? match : null,
      match.misaligned ? {label: HARROW.MATCH_TYPES.misaligned, icon: "fa-solid fa-arrows-rotate"} : null
    ].filter(v => !!v)
  }

  /* -------------------------------------------- */

  /**
   * Prepare data for Actor participants in the reading.
   * @returns {{actor: Actor, img: string, caption: string, card: Card|null, position: string, color: string, imgClass: string}[]}
   */
  #prepareParticipants(canDrawCard) {
    const participants = this.document.getFlag(HARROW.MODULE_ID, "participants") || [];
    const canSeeCards = (this.#step > HARROW.STEPS.PREPARE) || this.isEditable;
    return participants.map(p => {
      const actor = game.actors.get(p.actor);
      const player = game.users.find(u => u.character === actor);
      const actorCard = this.document.cards.get(p.card) ?? null;
      const readingCard = actorCard ? Object.values(this.#cards).find(c => c.id === actorCard.id) : null;
      return {
        actor,
        card: actorCard,
        position: p.position,
        img: actorCard?.faces[0].img,
        imgClass: Number.isNumeric(readingCard?.face) ? "active" : "",
        caption: actorCard?.faces[0].name,
        color: player?.color ?? p.color,
        revealed: canSeeCards && p.revealed,
        canClick: canDrawCard && actor.isOwner
      };
    });
  }

  /* -------------------------------------------- */
  /*  Sheet API                                   */
  /* -------------------------------------------- */

  /**
   * Begin the reading by advancing to the CHOOSE step.
   * Fill cards for any open slots in the spread.
   * Set all participant subject cards to be non-revealed.
   * @this {HarrowReadingSheet}
   * @returns {Promise<void>}
   */
  static async #onBeginReading() {
    if ( this.#step !== HARROW.STEPS.PREPARE ) {
      throw new Error("You may only begin a reading that is in the PREPARE step.");
    }
    const participants = this.document.getFlag(HARROW.MODULE_ID, "participants") || [];
    for ( const p of participants ) p.revealed = false;
    await this.#setFlags({step: HARROW.STEPS.CHOOSE, participants});
    this.#playSound("shuffle");
  }

  /* -------------------------------------------- */

  /**
   * Add a new participant Actor to the reading.
   * @param {Actor} actor     The actor to add as a reading participant
   * @returns {Promise<*>}
   */
  async addParticipant(actor) {
    if ( this.#step > HARROW.STEPS.CHOOSE ) {
      throw new Error("You may not add participants after the Choosing step of the reading");
    }
    const participants = this.document.getFlag(HARROW.MODULE_ID, "participants") || [];
    if ( participants.length === 9 ) {
      throw new Error(`You may not have more than 9 participants in a reading`);
    }
    const existing = participants.find(p => p.actor === actor.id);
    if ( existing ) throw new Error(`Participant "${actor.name}" is already present in the reading`);
    participants.push({
      actor: actor.id,
      card: null,
      color: Color.fromHSV([Math.random(), 0.8, 0.8]).css
    });
    await this.#setFlags({participants});
  }

  /* -------------------------------------------- */

  /**
   * Present the user with a dialog to choose an Actor to add to the reading.
   * @returns {Promise<Actor>}
   */
  async addParticipantDialog() {

    // Create array of actor options
    const participatingActors = new Set(this.#participants.map(p => p.actor));
    const actors = game.actors.filter(actor => !participatingActors.has(actor));
    if ( !actors.length ) {
      ui.notifications.error("There are no eligible Actors which can be added to this reading.");
      return null;
    }
    actors.sort((a, b) => a.name.localeCompare(b.name));
    const actorOptions = actors.reduce((options, actor) => {
      return options + `<option value="${actor.id}">${actor.name}</option>`;
    }, "")

    // Present user with a dialog to choose
    const label = game.i18n.localize("HARROW.AddParticipant");
    return Dialog.prompt({
      title: label,
      content: `
      <form>
        <div class="form-group">
          <label>Actor</label>
          <select name="actorId">${actorOptions}</select>
        </div>
      </form>`,
      label: label,
      rejectClose: false,
      callback: html => {
        const actorId = html.querySelector("select").value;
        return game.actors.get(actorId);
      },
      options: {jQuery: false, width: 320}
    });
  }

  /* -------------------------------------------- */

  /**
   * Remove a participant Actor from the reading.
   * @this {HarrowReadingSheet}
   * @returns {Promise<void>}
   */
  static async #onRemoveParticipant(_event, target) {
    const actorId = target.closest(".participant").dataset.actorId;
    const participants = this.document.getFlag(HARROW.MODULE_ID, "participants") || [];
    participants.findSplice(p => p.actor === actorId);
    return this.#setFlags({participants});
  }

  /* -------------------------------------------- */

  /**
   * Draw a subject card for a participant in the reading.
   * @param {string} actorId      The Actor ID to assign
   * @param {string} [position]   A specific position in the choosing that the card should appear
   * @returns {Promise<void>}
   */
  async chooseCard(actorId, position) {
    if ( this.#step !== HARROW.STEPS.CHOOSE ) {
      throw new Error(`You may only select a subject card during the choosing phase.`);
    }

    // Get the participant
    const participants = this.document.getFlag(HARROW.MODULE_ID, "participants") || [];
    const participant = participants.find(p => p.actor === actorId);
    if ( !participant ) throw new Error(`Participant "${actorId}" is not present in the reading`);
    if ( participant.card && participant.revealed ) {
      throw new Error(`Participant "${participant.actor.name}" already has a revealed subject card.`);
    }

    // Identify cards and positions which have already been assigned
    const {assignedCards, assignedPositions} = this.#getAssignedCardsPositions();

    // Choose a position
    position ||= this.#getAvailablePosition(assignedPositions);
    if ( assignedPositions.has(position) ) {
      throw new Error(`Position "${position}" is already occupied by another participant.`);
    }
    participant.position = position;

    // Reveal a pre-configured subject card
    let card
    if ( participant.card ) {
      card = this.document.cards.get(participant.card);
    }

    // Add a new subject card to the reading
    else {
      const cardData = this.#prepareCard(this.#getAvailableSubjectCard(assignedCards), {subject: actorId});
      card = await this.#createOrUpdate(cardData);
    }

    // Update participants flag
    participant.card = card.id;
    participant.position = position;
    participant.revealed = true;
    await this.#setFlags({participants});
    this.#playSound("draw");
  }

  /* -------------------------------------------- */

  /**
   * Choose cards for all participants in the reading who have not yet selected one.
   * @this {HarrowReadingSheet}
   * @returns {Promise<void>}
   */
  static async #onChooseAll() {
    if ( this.#step !== HARROW.STEPS.CHOOSE ) {
      throw new Error(`You may only choose a participant card during the choosing phase.`);
    }
    const {assignedCards, assignedPositions} = this.#getAssignedCardsPositions();
    const cards = this.document.toObject().cards;
    const participants = this.#participants.map(p => {
      const position = p.position || this.#getAvailablePosition(assignedPositions);
      assignedPositions.add(position);
      const card = p.card ?? this.#getAvailableSubjectCard(assignedCards);
      assignedCards.add(card.id);
      cards.push(this.#prepareCard(card, {subject: p.actor.id}));
      return {
        actor: p.actor.id,
        card: card.id,
        position: position,
        revealed: true,
        color: p.color
      }
    });
    await this.#setFlags({participants}, {cards});
    this.#playSound("draw");
  }

  /* -------------------------------------------- */

  /**
   * Get sets of currently assigned card IDs and positions.
   * @returns {{assignedCards: Set<string>, assignedPositions: Set<string>}}
   */
  #getAssignedCardsPositions() {
    const assignedCards = new Set();
    const assignedPositions = new Set();
    for ( const p of this.#participants ) {
      if ( p.card ) assignedCards.add(p.card.id);
      if ( p.position ) assignedPositions.add(p.position);
    }
    return {assignedCards, assignedPositions};
  }

  /* -------------------------------------------- */

  /**
   * @this {HarrowReadingSheet}
   * @returns {Promise<void>}
   */
  static async #onInterpretCard() {
    return game.journal.get(HARROW.JOURNAL_CARDS_ID)?.sheet.render(true, {
      pageId: this.#overlay.getFlag(HARROW.MODULE_ID, "pageId")
    });
  }

  /* -------------------------------------------- */

  /**
   * @type {HarrowReadingSheet}
   */
  static async #onHideOverlay() {
    await this.overlayCard(null)
  }

  /* -------------------------------------------- */

  /**
   * Reset the state of the Harrow Reading, removing all cards and clearing the designated suit.
   * @this {HarrowReadingSheet}
   * @returns {Promise<void>}
   */
  static async #onReset() {

    // Confirm if resetting an in-progress reading
    if ( this.#step > HARROW.STEPS.PREPARE ) {
      const confirm = await foundry.applications.api.DialogV2.confirm({
        window: {title: "HARROW.ResetTitle"},
        content: `<p>${game.i18n.localize("HARROW.ResetWarning")}</p>`,
        position: {width: 320},
        yes: {default: false}
      });
      if ( !confirm ) return;
    }

    // Reset the reading
    const hadCards = this.document.cards.size;
    await this.document.deleteEmbeddedDocuments("Card", [], {deleteAll: true, render: false});
    const participants = this.document.getFlag(HARROW.MODULE_ID, "participants") || [];
    for ( const p of participants ) {
      p.card = p.position = null;
      p.revealed = false;
    }
    await this.document.update({
      [`flags.${HARROW.MODULE_ID}`]: {
        overlay: null,
        step: HARROW.STEPS.PREPARE,
        suit: null,
        participants
      }
    });
    if ( hadCards ) this.#playSound("shuffle");
  }

  /* -------------------------------------------- */

  /**
   * Reveal a card, potentially advancing the step of the reading.
   * @param {string} position     The position in the spread to reveal
   * @returns {Promise<void>}
   */
  async revealCard(position) {
    const card = this.#cards[position];
    await card.flip(0);
    if ( Object.values(this.#cards).every(c => c.face === 0) ) {
      await this.#setFlags({step: HARROW.STEPS.READ}); // Mark all cards as read
    }
    this.#playSound("flip");
  }

  /* -------------------------------------------- */

  /**
   * Reveal all cards which are face-down in the reading.
   * @this {HarrowReadingSheet}
   * @returns {Promise<void>}
   */
  static async #onRevealAll() {
    const toUpdate = this.document.cards.map(c => ({_id: c.id, face: 0}));
    await this.document.updateEmbeddedDocuments("Card", toUpdate);
    await this.#setFlags({step: HARROW.STEPS.READ});
    this.#playSound("flip");
  }

  /* -------------------------------------------- */

  /**
   * Set a certain card as the overlay display. If null is set the overlay is hidden.
   * @param {Card|null} card
   * @returns {Promise<void>}
   */
  async overlayCard(card) {
    await this.#setFlags({overlay: card?.id ?? null});
    this.#playSound("draw");
  }

  /* -------------------------------------------- */

  /**
   * Initialize the spread by emptying the displayed reading.
   * @this {HarrowReadingSheet}
   * @returns {Promise<void>}
   */
  static async #onViewSpread() {
    const cards = this.#fillSpread();
    await this.#setFlags({step: HARROW.STEPS.SPREAD}, {cards});
    this.#playSound("shuffle");
  }

  /* -------------------------------------------- */

  /**
   * Draw reading cards for all positions which are not yet filled.
   * @returns {Promise<object[]>}
   */
  #fillSpread() {

    // Record cards which have already been used
    const subjects = {};
    const spread = {};
    const positions = {};
    const cards = this.document.cards.map(c => {
      const d = c.toObject();
      const {subject, position} = c.flags[HARROW.MODULE_ID] || {};
      if ( position ) {
        spread[c.id] = d;
        positions[position] = d;
      }
      if ( subject ) subjects[c.id] = d;
      return d;
    })

    // Identify cards which may be drawn, any unused card from the full deck
    const deck = game.cards.get(HARROW.DECK_ID);
    const available = deck.cards.filter(c => !(c.id in spread));

    // Populate the full array of cards
    for ( const position of HARROW.SPREAD_POSITIONS ) {

      // Use a pre-configured card
      const p = positions[position];
      if ( p ) {
        p.face = null;
        continue;
      }

      // Draw a new card
      const i = Math.floor(Math.random() * available.length)
      const draw = available[i];
      available.splice(i, 1);
      const subject = subjects[draw.id];

      // Upgrade a subject card
      if ( subject ) {
        subject.face = null;
        subject.flags[HARROW.MODULE_ID].position = position;
        continue;
      }
      cards.push(this.#prepareCard(draw, {face: null, position}));
    }
    return cards;
  }

  /* -------------------------------------------- */
  /*  Helper Methods                              */
  /* -------------------------------------------- */

  /**
   * Add or update a Card within the reading.
   * @param {object} cardData     Card data to create or update
   * @returns {Promise<Card>}     The created or updated Card document
   */
  #createOrUpdate(cardData) {
    const card = this.document.cards.get(cardData._id);
    if ( card ) return card.update(cardData);
    else return Card.create(cardData, {parent: this.document, keepId: true});
  }

  /* -------------------------------------------- */

  /**
   * Select a subject card from this reading which has not already been assigned to a participant.
   * @param {Set<string>} used  The cards IDs are already assigned as subject cards
   * @returns {Card}            An available card from the deck
   * @throws                    An error if no card is available
   */
  #getAvailableSubjectCard(used) {
    const deck = game.cards.get(HARROW.DECK_ID);
    const available = deck.cards.filter(c => !used.has(c.id) && ((this.#suit === "any") || (c.suit === this.#suit)));
    if ( !available.length ) throw new Error("There is no available card");
    return available[Math.floor(Math.random() * available.length)];
  }

  /* -------------------------------------------- */

  /**
   * Get a random position in the spread which has not already been chosen by a participant.
   * @param {Set<string>} used    The set of positions which are already occupied
   * @returns {string|null}
   */
  #getAvailablePosition(used) {
    const available = HARROW.SPREAD_POSITIONS.reduce((arr, p) => {
      if ( !used.has(p) ) arr.push([Math.random(), p]);
      return arr;
    }, []);
    if ( !available.length ) return null;
    available.sort((a, b) => b[0] - a[0]);
    return available[0][1];
  }

  /* -------------------------------------------- */

  /**
   * Play a named sound effect for all connected clients who are viewing this particular reading sheet.
   * Supported sounds: draw, flip, shuffle
   * @param {string} soundName
   */
  #playSound(soundName) {
    const src = `modules/${HARROW.MODULE_ID}/assets/sounds/${soundName}.ogg`;
    game.socket.emit(harrow.socketId, { // Emit to other players
      action: "playSound",
      data: {readingId: this.document.id, src}
    });
    foundry.audio.AudioHelper.play({src}); // Play locally
  }

  /* -------------------------------------------- */

  /**
   * Prepare Card data to be added to the reading.
   * @param {Card} card         The source Card being drawn
   * @param {object} options
   * @param {string|null} [options.subject]
   * @param {number|null} [options.face]
   * @param {string} [options.position]
   * @returns {Promise<Card>}   The created Card
   */
  #prepareCard(card, {subject=null, face=null, position}={}) {
    const cardData = card.toObject();
    cardData.face = face;
    cardData.origin = harrow.CONST.DECK_ID;
    const flags = cardData.flags[HARROW.MODULE_ID] || {};
    flags.position ??= position;
    flags.subject ??= subject;
    return cardData;
  }

  /* -------------------------------------------- */

  /**
   * Set a module flag for the Cards document.
   * @param {object} flags          An object of flag data to set
   * @param {object} [updateData]   Other updates to include with flags
   * @returns {Promise<void>} The updated document
   */
  async #setFlags(flags, updateData={}) {
    await this.document.update({
      flags: {
        [HARROW.MODULE_ID]: flags
      },
      ...updateData
    });
  }

  /* -------------------------------------------- */

  /**
   * Request that some other player choose a card on your behalf.
   * @param actorId
   * @param position
   */
  #requestCard(actorId, position) {
    const requestFrom = game.users.find(u => u.active && this.document.testUserPermission(u, "OWNER"));
    if ( !requestFrom ) {
      return ui.notifications.warn("HARROW.RequestUnavailable", {localize: true});
    }
    game.socket.emit(harrow.socketId, {
      action: "requestCard",
      data: {readingId: this.document.id, actorId, position}
    }, {recipients: [requestFrom.id]});
  }

  /* -------------------------------------------- */

  /**
   * Handle a request from some other client to choose a subject card.
   * @param {object} messageData     Socket event data
   * @param {string} messageData.actorId    The requesting actor ID
   * @param {string} [messageData.position] The requested card position
   */
  handleCardRequest({actorId, position}={}) {
    const participants = this.document.getFlag(HARROW.MODULE_ID, "participants");
    const participant = participants.find(p => p.actor === actorId);
    if ( !participant || (participant.card && participant.revealed) ) return;
    this.chooseCard(actorId, position);
  }

  /* -------------------------------------------- */
  /*  Interactivity and Event Handling            */
  /* -------------------------------------------- */

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    if ( options.parts.includes("reading") ) {
      this.element.querySelector("section[data-application-part=reading]")
        .addEventListener("contextmenu", this.#onRightClickCard.bind(this));
    }
    this.#dragDrop.bind(this.element);
  }

  /* -------------------------------------------- */

  /** @override */
  _onChangeForm(formConfig, event) {
    const select = event.target;
    if ( select.id === `${this.id}-suit` ) {
      const suit = select.value
      this.#setFlags({suit}, {img: HARROW.SUIT_ICONS[suit] || HARROW.SUIT_ICONS.any});
    }
    return super._onChangeForm(formConfig, event);
  }

  /* -------------------------------------------- */

  /**
   * @this {HarrowReadingSheet}
   * @returns {Promise<void>}
   */
  static async #onAddParticipant() {
    const addParticipant = await this.addParticipantDialog();
    if ( !addParticipant ) return;
    try {
      await this.addParticipant(addParticipant);
    } catch(err) {
      ui.notifications.error(err.message);
    }
  }

  /* -------------------------------------------- */

  /**
   * Allow document observers to request a card during the CHOOSE phase.
   * @this {HarrowReadingSheet}
   * @param {HTMLElement} slotEl The triggering element
   */
  static async #onRequestCard(_event, slotEl) {
    if ( this.#step !== HARROW.STEPS.CHOOSE ) return;

    // Request card for a subject you own
    if ( slotEl.classList.contains("subject") ) {
      const actor = game.actors.get(slotEl.closest(".participant").dataset.actorId);
      return actor.isOwner && this.#requestCard(actor.id);
    }

    // Request card in a specific position
    else {
      const nextParticipant = this.#participants.find(p => p.actor.isOwner );
      return nextParticipant && this.#requestCard(nextParticipant.actor.id, slotEl.dataset.position);
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle left-click events on a Harrow card.
   * @this {HarrowReadingSheet}
   * @param {HTMLElement} slotEl
   * @returns {Promise<void>}
   */
  static async #onControlCard(_event, slotEl) {

    // PREPARE
    if ( this.#step === HARROW.STEPS.PREPARE ) return;

    // CHOOSE
    if ( this.#step === HARROW.STEPS.CHOOSE ) {

      // Choose random subject card
      if ( slotEl.classList.contains("subject") ) {
        const actorId = slotEl.closest(".participant").dataset.actorId;
        return this.chooseCard(actorId);
      }

      // Choose specific subject card
      else if ( !slotEl.dataset.cardId ) {
        const nextParticipant = this.#participants.find(p => !p.revealed);
        return nextParticipant && this.chooseCard(nextParticipant.actor.id, slotEl.dataset.position);
      }

      // Overlay chosen subject card
      else if ( this.isEditable ) {
        const card = this.document.cards.get(slotEl.dataset.cardId);
        const alreadyChosen = this.#participants.find(p => p.card?.id === card.id);
        if ( alreadyChosen ) return this.overlayCard(card);
      }
      return;
    }

    // SPREAD
    if ( this.isEditable && (this.#step >= HARROW.STEPS.SPREAD) ) {
      const card = this.#cards[slotEl.dataset.position];
      if ( card.face === null ) return this.revealCard(slotEl.dataset.position);
      else return this.overlayCard(this.#overlay === card ? null : card);
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle right click events on a filled card slot during the PREPARE phase
   * @param {Event} event   The originating right-click event
   */
  async #onRightClickCard(event) {
    const slotEl = event.target.closest(".card");
    if ( !slotEl ) return;
    event.preventDefault();
    if ( this.#step !== HARROW.STEPS.PREPARE ) return;
    let card;

    // Get current flags for both the reading and the card
    const readingFlags = {...this.document.flags[HARROW.MODULE_ID]};
    let cardFlags;

    // Clear participant subject card
    const participant = slotEl.closest(".participant");
    if ( participant ) {
      const p = readingFlags.participants.find(p => p.actor === participant.dataset.actorId);
      card = this.document.cards.get(p.card);
      cardFlags = {...card.flags[HARROW.MODULE_ID]};
      p.card = null;
      p.revealed = false;
      cardFlags.subject = null;
    }

    // Clear spread card
    else {
      card = this.#cards[slotEl.dataset.position];
      cardFlags = {...card.flags[HARROW.MODULE_ID]};
      cardFlags.position = null;
    }

    // Update reading flags
    await this.document.update({[`flags.${HARROW.MODULE_ID}`]: readingFlags});

    // Update or remove the card
    if ( !(cardFlags.position || cardFlags.subject) ) await card.delete();
    else await card.update({[`flags.${HARROW.MODULE_ID}`]: cardFlags});
  }

  /* -------------------------------------------- */

  /**
   * @this {HarrowReadingSheet}
   * @returns {Promise<void>}
   */
  static async #onViewDeck() {
    const deckSheet = game.cards.get(HARROW.DECK_ID).sheet;
    await deckSheet.rendered ? deckSheet.close() : deckSheet.render({force: true});
  }

  /* -------------------------------------------- */

  /**
   * @this {HarrowReadingSheet}
   * @returns {Promise<void>}
   */
  static async #onViewRules() {
    const rulesSheet = game.journal.get(HARROW.JOURNAL_RULES_ID).sheet;
    await rulesSheet.rendered ? rulesSheet.close() : rulesSheet.render({force: true});
  }


  /* -------------------------------------------- */

  /** @override */
  async _onDrop(event) {
    const data = TextEditor.getDragEventData(event);

    // Drop an Actor before or during the CHOOSE step
    if ( data.type === "Actor" ) {
      if ( this.#step > HARROW.STEPS.CHOOSE ) return;
      const actor = fromUuidSync(data.uuid);
      try {
        await this.addParticipant(actor);
      } catch(err) {
        ui.notifications.error(err.message);
      }
      return
    }

    // Drop a Card during the PREPARE step
    if ( (data.type !== "Card") || (this.#step !== HARROW.STEPS.PREPARE ) ) return;
    const card = fromUuidSync(data.uuid);

    // Choose Subject Card
    const participant = event.target.closest(".participant");
    if ( participant ) return this.#onDropParticipant(participant, card);

    // Choose Reading Chard
    const reading = event.target.closest(".slot");
    if ( reading ) return this.#onDropCard(reading, card);
  }

  /* -------------------------------------------- */

  /**
   * Handle manual dropping of a Card to assign it to a spread position.
   * @param {HTMLElement} slot    The spread position
   * @param {Card} card           The dropped Card document
   */
  async #onDropCard(slot, card) {
    const existing = this.document.cards.get(card.id);
    if ( existing ) await existing.setFlag(HARROW.MODULE_ID, "position", slot.dataset.position);
    else {
      const cardData = this.#prepareCard(card, {position: slot.dataset.position, face: 1});
      await this.#createOrUpdate(cardData);
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle manual dropping of a Card to assign it to a reading participant.
   * @param {HTMLElement} slot    The participant slot
   * @param {Card} card           The dropped Card document
   */
  async #onDropParticipant(slot, card) {

    // Validate that the subject card must belong to the correct suit.
    if ( (this.#suit !== "any") && (card.suit !== this.#suit) ) {
      const err = game.i18n.format("HARROW.WarningIncorrectSuit", {card: card.name, suit: this.#suit});
      return ui.notifications.error(err);
    }

    // Identify the participant
    const participants = this.document.getFlag(HARROW.MODULE_ID, "participants") || [];
    const participant = participants.find(p => p.actor === slot.dataset.actorId);

    // Ensure the participant does not already have a card
    if ( participant.card ) {
      const existing = this.document.cards.get(participant.card);
      const err = game.i18n.format("HARROW.WarningParticipantAlreadyAssigned", {card: existing.name});
      return ui.notifications.error(err);
    }

    // Ensure that the subject card is not already used by some other participant
    const taken = this.#participants.find(p => p.card && (p.card.id === card.id));
    if ( taken ) {
      const err = game.i18n.format("HARROW.WarningSubjectCardTaken", {card: card.name, actor: taken.actor.name});
      return ui.notifications.error(err);
    }
    participant.card = card.id;
    participant.revealed = true;

    // Create or update Card
    const existing = this.document.cards.get(card.id);
    if ( existing ) await existing.setFlag(HARROW.MODULE_ID, "subject", true);
    else {
      const cardData = this.#prepareCard(card, {subject: participant.actor, face: 1});
      await this.#createOrUpdate(cardData);
    }

    // Assign participant metadata
    return this.#setFlags({participants});
  }

  /* -------------------------------------------- */

  /**
   * Adapted from core Journal.showDialog.
   * TODO: Ideally this should be generalized by the core software and this could be removed.
   * @param {Cards} doc     The reading document to show
   */
  async showDialog(doc) {
    if ( !doc.isOwner ) return ui.notifications.error("JOURNAL.ShowBadPermissions", {localize: true});
    if ( game.users.size < 2 ) return ui.notifications.warn("JOURNAL.ShowNoPlayers", {localize: true});
    if ( this.#step === HARROW.STEPS.PREPARE ) {
      return ui.notifications.warn("HARROW.SharePrepareWarning", {localize: true})
    }

    // Identify users and ownership levels
    const users = game.users.filter(u => u.id !== game.userId);
    const ownership = Object.entries(CONST.DOCUMENT_OWNERSHIP_LEVELS);
    if ( !doc.isEmbedded ) ownership.shift();
    const levels = [
      {level: CONST.DOCUMENT_META_OWNERSHIP_LEVELS.NOCHANGE, label: "OWNERSHIP.NOCHANGE"},
      ...ownership.map(([name, level]) => ({level, label: `OWNERSHIP.${name}`}))
    ];

    // Prompt with a Dialog to choose users and ownership
    const html = await renderTemplate("templates/journal/dialog-show.html", {users, levels, isImage: false});
    return Dialog.prompt({
      title: game.i18n.format("JOURNAL.ShowEntry", {name: doc.name}),
      label: game.i18n.localize("JOURNAL.ActionShow"),
      content: html,
      render: html => {
        const form = html.querySelector("form");
        form.elements.allPlayers.addEventListener("change", event => {
          const checked = event.currentTarget.checked;
          form.querySelectorAll('[name="players"]').forEach(i => {
            i.checked = checked;
            i.disabled = checked;
          });
        });
      },
      callback: async html => {
        const form = html.querySelector("form");
        const fd = new FormDataExtended(form).object;
        const users = fd.allPlayers ? game.users.filter(u => !u.isSelf) : fd.players.reduce((arr, id) => {
          const u = game.users.get(id);
          if ( u && !u.isSelf ) arr.push(u);
          return arr;
        }, []);
        if ( !users.length ) return;
        const userIds = users.map(u => u.id);
        if ( fd.ownership > -2 ) {
          const ownership = doc.ownership;
          if ( fd.allPlayers ) ownership.default = fd.ownership;
          for ( const id of userIds ) {
            if ( fd.allPlayers ) {
              if ( (id in ownership) && (ownership[id] <= fd.ownership) ) delete ownership[id];
              continue;
            }
            if ( ownership[id] === CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE ) ownership[id] = fd.ownership;
            ownership[id] = Math.max(ownership[id] ?? -Infinity, fd.ownership);
          }
          await doc.update({ownership}, {diff: false, recursive: false, noHook: true});
        }

        // Notify success
        ui.notifications.info(game.i18n.format("JOURNAL.ActionShowSuccess", {
          title: doc.name,
          which: game.i18n.localize(userIds.length ? "selected": "all")
        }));

        // Emit socket request to specific users
        game.socket.emit(harrow.socketId, {
          action: "showReading",
          data: {readingId: doc.id}
        }, {recipients: userIds});
      },
      rejectClose: false,
      options: {jQuery: false}
    });
  }
}
