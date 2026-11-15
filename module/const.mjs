/**
 * The allowed alignment types supported by the Harrow deck.
 * @enum {Readonly<string>}
 */
export const ALIGNMENTS = {
  LG: "HARROW.ALIGNMENT.LG",
  NG: "HARROW.ALIGNMENT.NG",
  CG: "HARROW.ALIGNMENT.CG",
  LN: "HARROW.ALIGNMENT.LN",
  TN: "HARROW.ALIGNMENT.TN",
  CN: "HARROW.ALIGNMENT.CN",
  LE: "HARROW.ALIGNMENT.LE",
  NE: "HARROW.ALIGNMENT.NE",
  CE: "HARROW.ALIGNMENT.CE"
};

/**
 * Alignments which are diametrically opposite.
 * @enum {Readonly<string>}
 */
export const OPPOSITE_ALIGNMENTS = {
  LG: "CE",
  NG: "NE",
  CG: "LE",
  LN: "CN",
  CN: "LN",
  LE: "CG",
  NE: "NG",
  CE: "LG"
};

/**
 * The ID of the source deck of Harrow Cards.
 * @type {string}
 */
export const DECK_ID = "HarrowDeck000000";

/**
 * The ID of the source journal entries which describe each Card.
 * @type {string}
 */
export const JOURNAL_CARDS_ID = "HarrowCards00000";

/**
 * The ID of the journal entry which contains Harrow rules.
 * @type {string}
 */
export const JOURNAL_RULES_ID = "HarrowRulebook00";

/**
 * The steps of the reading workflow.
 * @enum {number}
 */
export const STEPS = Object.freeze({
  PREPARE: 0,
  CHOOSE: 1,
  SPREAD: 2,
  READ: 3
});

/**
 * The allowed card suit types supported by the Harrow deck.
 * @enum {Readonly<string>}
 */
export const SUITS = {
  any: "HARROW.SUIT.ANY",
  hammers: "HARROW.SUIT.HAMMERS",
  keys: "HARROW.SUIT.KEYS",
  shields: "HARROW.SUIT.SHIELDS",
  books: "HARROW.SUIT.BOOKS",
  stars: "HARROW.SUIT.STARS",
  crowns: "HARROW.SUIT.CROWNS"
};

export const SUIT_ICONS = {
  any: "modules/pf2e-decks-harrow/assets/journals/hand.webp",
  hammers: "modules/pf2e-decks-harrow/assets/suits/hammer.webp",
  keys: "modules/pf2e-decks-harrow/assets/suits/key.webp",
  shields: "modules/pf2e-decks-harrow/assets/suits/shield.webp",
  books: "modules/pf2e-decks-harrow/assets/suits/book.webp",
  stars: "modules/pf2e-decks-harrow/assets/suits/star.webp",
  crowns: "modules/pf2e-decks-harrow/assets/suits/crown.webp"
};

/**
 * Classified types of matches based on the relationship between card alignment and spread position.
 * @enum {Readonly<string>}
 */
export const MATCH_TYPES = {
  none: "HARROW.MATCHES.NONE",
  true: "HARROW.MATCHES.TRUE",
  opposite: "HARROW.MATCHES.OPPOSITE",
  partial: "HARROW.MATCHES.PARTIAL",
  misaligned: "HARROW.MATCHES.MISALIGNED"
}

export const MODULE_ID = "pf2e-decks-harrow";

export const POSITIONS = {
  LG: "HARROW.POSITION.LG",
  NG: "HARROW.POSITION.NG",
  CG: "HARROW.POSITION.CG",
  LN: "HARROW.POSITION.LN",
  TN: "HARROW.POSITION.TN",
  CN: "HARROW.POSITION.CN",
  LE: "HARROW.POSITION.LE",
  NE: "HARROW.POSITION.NE",
  CE: "HARROW.POSITION.CE"
};

/**
 * The position order in which cards appear in the spread.
 * @type {string[]}
 */
export const SPREAD_POSITIONS = ["LG", "NG", "CG", "LN", "TN", "CN", "LE", "NE", "CE"];
