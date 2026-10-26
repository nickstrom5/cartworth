// Query/product relevance scoring. Shared by the server and the browser.
//
// Store search engines return plenty of tangential products ("milk chocolate" for "milk").
// We score every product so that summaries ("cheapest milk per gallon") only use true matches,
// while still letting the user see everything.

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'for', 'with', 'in', 'to', 'by', 'fresh', 'brand', 'ct', 'oz', 'lb', 'pack', 'pk']);

const SYNONYMS = {
  oj: ['orange', 'juice'],
  // One spelling each, so "bbq sauce" finds Sweet Baby Ray's Barbecue Sauce and "black-eyed peas"
  // finds Bush's Blackeye Peas (the holiday matrix).
  // One token: split, its "in" made the "tuna in oil" rule skip the next words, so "Bone-In Butt Pork
  // Shoulder Steak" hid its 'pork' and answered Valentine's "steak" (the state x holiday audit).
  'bone-in': ['bonein'], 'skin-on': ['skinon'],
  barbecue: ['bbq'], 'bar-b-q': ['bbq'], blackeye: ['black', 'eyed'], blackeyed: ['black', 'eyed'],
  tp: ['toilet', 'paper'],
  evoo: ['extra', 'virgin', 'olive', 'oil'],
  pb: ['peanut', 'butter'],
  pj: ['pajama'],
  bsb: ['boneless', 'skinless', 'breast'],
  bscb: ['boneless', 'skinless', 'chicken', 'breast'],
  hh: ['half', 'half'],
  'half-and-half': ['half', 'half'],
  // One word for one product: Libby's "100% Pure Pumpkin" is pumpkin puree, and Thanksgiving's
  // "pumpkin puree" missed it, and ALDI's, by name (the Thanksgiving run, Dallas).
  puree: ['pure'],
  // Nestle Toll House sells chocolate chips as "Morsels"; "chocolate chips" missed the best-known bag.
  morsel: ['chip'], morsels: ['chip'],
};

// Words that turn a product into something else when they FOLLOW the searched noun:
// "milk" -> "milk chocolate", "banana" -> "banana bread", "chicken" -> "chicken broth", "egg" -> "egg noodles".
const TRAPS = new Set([
  'chocolate', 'candy', 'cookie', 'cracker', 'cereal', 'snack', 'bread', 'crumb', 'muffin', 'cake', 'pie', 'brownie', 'donut',
  'sauce', 'dressing', 'soup', 'broth', 'stock', 'bouillon', 'seasoning', 'marinade', 'rub', 'gravy', 'mix', 'powder',
  'drink', 'juice', 'smoothie', 'shake', 'yogurt', 'creamer', 'cheese', 'noodle', 'pasta', 'ramen', 'ricotta',
  'soap', 'shampoo', 'conditioner', 'lotion', 'candle', 'freshener', 'spray', 'wipe', 'detergent', 'cleaner', 'filter', 'mug',
  'treat', 'dog', 'cat', 'pet', 'kibble', 'bone', 'infant', 'toddler', 'gummy', 'gummies', 'vitamin', 'supplement',
  'extract', 'syrup', 'spread', 'dip', 'jam', 'jelly', 'preserve', 'pudding', 'gelatin', 'hash', 'fry', 'surprise', 'popsicle', 'bar', 'bite', 'chip', 'crisp',
  'nugget', 'tender', 'patty', 'burger', 'sausage', 'jerky', 'salad', 'sandwich', 'wrap', 'pizza', 'meal', 'entree', 'kit',
  // Compound-modifier nouns: "peanut butter", "cream cheese", "macaroni and cheese", "beef base",
  // "butter lettuce". Without these the head noun matched and the product scored as a real hit.
  'peanut', 'cream', 'macaroni', 'mac', 'chili', 'base', 'lettuce', 'dinner', 'casserole', 'bisque',
  // "Tomato Ketchup" and "Tomato Paste" were the best "tomatoes", "Spaghetti Squash" the best
  // "spaghetti" (the nationwide audit, Nashville/Burlington/New Orleans).
  'ketchup', 'catsup', 'paste', 'squash',
  // singular() keeps an -as ending, so the plural needs its own entry ("Tortillas, White Corn" won
  // "corn"); and filled buns that are not bread buns ("Manapua" won Hawaii's "buns").
  'tortillas', 'manapua', 'bao', 'siopao', 'fork', 'spoon', 'cutlery', 'drop', 'lozenge',
  'stew', 'hummus', 'pesto', 'salsa', 'guacamole', 'dressing', 'concentrate', 'concentrated', 'substitute', 'flavoring',
  // Head nouns that make the searched word a modifier: "butter popcorn", "butter shrimp",
  // "all butter danish". Found in live Sam's Club and Costco results, where each one produced an
  // absurd per-pound price that then set the scale of the per-store chart.
  'popcorn', 'pretzel', 'granola', 'danish', 'twist', 'pastry', 'scone', 'croissant', 'roll',
  'shrimp', 'salmon', 'tuna', 'crab', 'lobster', 'scallop', 'fish', 'chicken', 'beef', 'pork',
  // The rest of the shellfish, for the same reason: "Garlic Butter Mussels", "Clams in Butter
  // Sauce" and "Butter Garlic Squid" are seafood, not butter. Handoff from the round-2 directory
  // fixer. "Oyster mushrooms" are mushrooms: see BENIGN_BEFORE.
  'clam', 'mussel', 'oyster', 'squid', 'octopus',
  'turkey', 'ham', 'bacon', 'steak', 'ravioli', 'lasagna', 'pierogi', 'dumpling', 'taco', 'burrito',
  'cupcake', 'brownie', 'toffee', 'fudge', 'caramel', 'praline', 'nut', 'almond', 'cashew', 'pecan',
  // Single-serve and concentrated forms that cannot be compared on unit price with the thing
  // itself: a K-Cup box against ground coffee, a wellness shot against a carton of juice. Found in
  // live Cermak, Tony's and Whole Foods results at 16x to 59x the median.
  'pod', 'keurig', 'capsule', 'shot', 'concentrate', 'instant', 'powdered',
  // Non-food that shares a food word. "Body Butter" skincare was matching a butter search at
  // $119/lb in live Sprouts results, alongside a belly balm and a tallow elixir. Cookware too:
  // Whole Foods lists a "One Egg Pan" against a search for eggs.
  'skincare', 'balm', 'salve', 'elixir', 'tallow', 'body', 'wellness', 'serum', 'moisturizer',
  // NOT 'pan' or 'skillet': "Pan Pizza" and "skillet meal" are real foods, and adding them made a
  // pizza search reject DiGiorno. Cookware like Whole Foods' "One Egg Pan" is left to the
  // plausibility guard, which flags it on unit price instead of guessing from the name.
  'cookware', 'utensil',
  // Hardware that shares "aluminum foil": Meijer's cheapest "aluminum foil" match in round 2's
  // Milwaukee and Kenosha captures was a "Flexible Aluminum Foil Duct" for a dryer vent, at $11.99,
  // and the next a roll of HVAC foil tape. No grocery search contains these words.
  'duct', 'hvac', 'tape',
  // Prepared forms that are not the raw ingredient.
  'boiled', 'deviled', 'pickled',
  // Imitation products and prepared dishes, found in live results: margarine sold as "Tastes Like
  // Butter", and "Buttery Mashed Potatoes" scoring as butter.
  'margarine', 'buttery', 'imitation', 'potato', 'potatoes', 'mashed', 'casserole', 'gratin', 'pierogi', 'pilaf',
  'oil', 'vinegar', 'tea', 'coffee', 'cone', 'waffle', 'pancake', 'bagel', 'tortilla', 'bun', 'biscuit', 'croissant',
  'pastry', 'granola', 'bouquet', 'plant', 'seed', 'fertilizer', 'toy', 'costume', 'card', 'flavored', 'flavor', 'cream', 'butter',
  // Legumes as a compound modifier: "Brown Sugar & Hickory Baked Beans" covered both words of
  // "brown sugar" and became ALDI's, Mariano's and Meijer's cheapest brown sugar in live results,
  // beating the real 4 lb bag sitting in the same response. Safe for the basket because a trap is
  // skipped whenever the shopper typed it, so "green beans" is untouched.
  'bean', 'lentil', 'chickpea',
  // Bakery shapes that carry a fruit name: Sam's Club's "Cranberry Orange Walnut Boule" was the
  // store's headline price for fresh cranberries at $5.05/lb.
  'boule', 'loaf', 'baguette', 'walnut', 'pistachio',
  // Alcohol. Hard cider scored 0.80-0.90 against "apple cider" in every ZIP and at $170/gal it
  // dragged the median far enough to move the plausibility floor. A grocery price comparison also
  // should not answer "apple cider" with a six-pack of 6.9% ABV. Guarded by the query, so someone
  // searching for wine or seltzer still finds it.
  'hard', 'alcoholic', 'beer', 'ale', 'lager', 'ipa', 'wine', 'vodka', 'whiskey', 'whisky', 'rum',
  'tequila', 'bourbon', 'liqueur', 'brandy', 'cocktail', 'hopped', 'cerveza', 'seltzer',
  // 'wine' alone missed the wine itself: flyers print the grape, not the word. JaM Cellars'
  // "Butter" Chardonnay ($16.99) scored 0.92 against butter in the weekly-ad search, the same as a
  // pound of Land O Lakes (handoff from the round-2 directory fixer). Grapes and producer words
  // only; not 'champagne' or 'rose', which also name grapes, vinegars and rose water.
  'chardonnay', 'merlot', 'cabernet', 'pinot', 'sauvignon', 'riesling', 'moscato', 'zinfandel', 'malbec',
  'prosecco', 'stout', 'perry', 'cellars', 'winery', 'vineyard', 'brewery', 'brewing',
  // Health and beauty that borrows a food word. "Redken All Soft Heavy Cream Treatment" at
  // $632/gal was a relevant match for "heavy cream", and a "Rosemary Apple Cider Scalp Detox
  // Tonic" for apple cider.
  'treatment', 'tonic', 'detox', 'scalp', 'hair', 'cosmetic', 'makeup', 'deodorant',
  // Seasonings and dressings named after the dish. A 1.12 oz jar of "McCormick Pumpkin Pie Spice"
  // is correctly priced at $99.86/lb and has nothing to do with the price of a pumpkin pie, but it
  // scored as one in every ZIP and then tripped the plausibility guard on a price that was right.
  'spice', 'vinaigrette',
  // Christmas and Hanukkah look-alikes: a ham glaze packet is not a ham, cream cheese frosting is not
  // cream cheese, and "Sardines in Vegetable Oil" is not vegetable oil (tuna was already a trap).
  'glaze', 'frosting', 'icing', 'sardine', 'anchovy', 'mackerel', 'herring',
  // A can of pie filling and a bag of marshmallows named after what they taste of or look like:
  // "Lucky Leaf Caramel Apple Fruit Filling" (Meijer, Food Lion) answered "caramel apples", and
  // "Jet-Puffed Candy Corn Shaped Halloween Fall Marshmallows" (Rouses, ShopRite) "halloween candy"
  // (the Halloween run).
  'filling', 'marshmallow',
]);

/**
 * Whole-name markers for things that are not groceries at all.
 *
 * The position-aware trap loop cannot see these: it skips any word sitting behind an "in" or
 * "with" phrase (so "tuna in oil" is not penalised), and that is exactly where the giveaway word
 * lands in "Turkey in Disguise (Hardcover)". Sam's Club returned that children's book at 0.87 for
 * a turkey search, and Meijer returned an "Owala ... Stainless Steel Bottle" at $28.66/lb for
 * marshmallows. Matching the whole name sidesteps the position rules entirely.
 *
 * Holiday decor joined the list in the Christmas run: Walmart's "LED Light-Up Christmas Candy Cane
 * Lawn Stakes" (10 ct, $12.88) was Chicago's best price for candy canes. Not 'christmas tree' (Little
 * Debbie's Christmas Tree Cakes are food), 'decorations' (cake decorations are baking aisle) or
 * 'stocking' (a candy-filled stocking is candy).
 */
const NON_GROCERY_RE = /\b(?:satin flowers?|silk flowers?|artificial flowers?|faux|hardcover|paperback|board book|audiobook|dvd|blu-?ray|vinyl record|jigsaw|puzzle|stainless steel|tumbler|cookbook|gift card|apparel|t-shirt|lawn|light-?up|led lights?|string lights|inflatable|ornaments?|wreaths?|garland|tree topper|gift wrap|wrapping paper|nativity|figurines?|pajamas|sweater|scrub|dolls?|gift bags?|battery[- ]operated|books?|scented)\b/i;

// Party goods, kitchen tools and costume pieces named after a food or a holiday. Unlike
// NON_GROCERY_RE these are things a shopper may well search for, so asking for one finds it. The
// third Halloween run (24 Oct) found them answering "pumpkin": a vinyl tablecloth, an eye mask, an
// ice mold, scratch art, silicone baking pans, a carving light, a balloon and a glow wand. Only
// compound or unambiguous words: 'pan' alone is pan dulce, 'light' alone is light cream and light
// tuna, 'kit' alone is a salad kit, 'wand' alone is a candy wand. Candles and wax melts moved here
// from NON_GROCERY_RE so that a search for birthday candles finds them. Napkins and paper plates
// from the live rerun (26 Oct): ALDI's "Kirkton House Fall Napkins, Pumpkin" was the best pumpkin in
// nine states.
const NON_FOOD_RE = /\b(?:(?:eye |face |sheet |sleep )?masks?|(?:ice |candy |chocolate |silicone |cake |cookie )?molds?|moulds?|tablecloths?|table ?covers?|table runners?|placemats?|napkins?|paper (?:plates?|cups?|bowls?|towels?)|(?:dessert|dinner|party|luncheon|beverage|cocktail) plates?|stencils?|balloons?|(?:glow|magic|bubble|wizard|witch|fairy|pumpkin|light-?up) wands?|glow sticks?|scratch art|coloring (?:books?|pages)|stickers?|costumes?|carving (?:kits?|tools?|sets?)|craft kits?|(?:baking|cake|muffin|loaf|sheet|roasting|bundt|pie|springform|cupcake) pans?|bakeware|silicone|\d+ in 1 lights?|flashlights?|night ?lights?|tea lights?|wax melts?|candles?)\b/;

/**
 * Qualifiers that turn a trap noun back into an ordinary description of the searched product.
 *
 * "Sweet Cream Butter" is the standard US label for plain butter — Land O'Lakes, Kirkland, Dutch
 * Farms and every ALDI store brand use it — but 'cream' is a trap so that "cream cheese" does not
 * score as cheese. The result was that plain butter scored 0.40 and lost to spreadable blends at
 * 0.97, and the per-store chart overstated Costco's cheapest butter by 100% and ALDI's by 42%.
 * Only the occurrence immediately after the qualifier is forgiven, so "Sweet Cream ICE Cream" is
 * still trapped on its second 'cream'.
 */
// From the Christmas run: "Sprinkles Mix" is sprinkles; "Ocean Spray" is a brand, not a household
// spray (its Jellied Cranberry Sauce scored 0.37 and was refused in every cranberry search); and a
// "Juice Cocktail" is juice, not alcohol.
const BENIGN_AFTER = { cream: new Set(['sweet', 'whipping']), mix: new Set(['sprinkle']), spray: new Set(['ocean']), cocktail: new Set(['juice']), concentrate: new Set(['from']), squash: new Set(['zucchini', 'yellow', 'summer', 'butternut', 'acorn']) };
/** The mirror image: a trap noun forgiven when the word right AFTER it names what it is. "King
 * Oyster Mushrooms" are mushrooms, so 'oyster' must not bury them in a mushroom search. */
// Bread flour is flour: 'bread' is a trap so that "banana bread" is not bananas.
const BENIGN_BEFORE = { oyster: new Set(['mushroom']), bread: new Set(['flour']) };

// Plant bases in front of the noun make a different product: "almond milk", "coconut milk", "oat creamer".
const ALT_BASE = new Set(['almond', 'oat', 'oatmilk', 'soy', 'coconut', 'cashew', 'rice', 'hemp', 'macadamia', 'pea', 'plant', 'pistachio', 'flax', 'banana', 'evaporated', 'condensed', 'powdered', 'dry', 'goat']);

// Prepared/processed forms are still the product but rarely what a price-checker wants.
const MILD = new Set(['frozen', 'dried', 'liquid', 'breaded', 'stuffed', 'rotisserie', 'cooked', 'grilled', 'fried', 'marinated', 'seasoned', 'smoked', 'glazed', 'sweetened', 'mini', 'snack', 'kids']);

// How the food is kept, not what it is. Only these are forgiven when the retailer's own category
// is exactly what was searched (see catCoversQuery). 'dried' is deliberately NOT here: dried
// cranberries are a different commodity from fresh ones and sell at a wildly different price per
// pound, and 'smoked' likewise makes a turkey a different purchase.
const STORAGE_STATE = new Set(['frozen', 'chilled', 'refrigerated']);

// Flavors make it a different product for price comparison ("chocolate milk" vs "milk").
const FLAVOR = new Set(['chocolate', 'strawberry', 'vanilla', 'banana', 'caramel', 'mocha', 'cinnamon', 'honey', 'maple', 'pumpkin', 'peppermint', 'cookie', 'cherry', 'blueberry', 'raspberry', 'peach', 'mango', 'coconut', 'hazelnut', 'flavored', 'flavor']);
// Flavours that ARE the product when the shopper names it: candy canes are peppermint, fudge and
// brownies are chocolate. Without this, "Brach's Peppermint Candy Canes" scored 0.46 against
// "candy canes" and every real cane was refused, leaving a light-up lawn stake as the best price
// (the Christmas run). Keyed by a word of the query.
const INHERENT_FLAVOR = { cane: new Set(['peppermint']), bark: new Set(['peppermint', 'chocolate']), fudge: new Set(['chocolate']), brownie: new Set(['chocolate']), truffle: new Set(['chocolate']), cocoa: new Set(['chocolate']), tomato: new Set(['cherry']), tomatoes: new Set(['cherry']) };

// Words that describe, rather than change, what a particular query asks for. The trap and flavour
// rules are general ("beef" before a noun usually makes it a different food), but for some queries
// the word is simply the product's own description: a steak search is answered by "Beef Ribeye
// Steak", a wine search by a Cabernet, "buns" by "Hot Dog Buns". Found by the holiday matrix
// (test/qa-holiday-matrix.test.js), where each of these hid the real product from a holiday list.
const BEEF_CUT = ['beef', 'bone', 'frozen', 'smoked'];
const ANIMALS = ['beef', 'pork', 'chicken', 'turkey', 'lamb', 'bone', 'frozen', 'smoked'];
const ALCOHOL_WORDS = ['wine', 'red', 'white', 'rose', 'sparkling', 'chardonnay', 'merlot', 'cabernet', 'pinot', 'sauvignon', 'riesling', 'moscato', 'zinfandel', 'malbec', 'prosecco', 'cellars', 'winery', 'vineyard', 'brut', 'champagne', 'cava'];
const QUERY_ALLOWS = Object.fromEntries(Object.entries({
  wine: ALCOHOL_WORDS, prosecco: ALCOHOL_WORDS, champagne: ALCOHOL_WORDS,
  // Beef only for steak and brisket: "Pork Brisket Sparerib Strip" won Hanukkah brisket and "Pork Shoulder
  // Steak" Valentine's steak (the state x holiday audit), a different animal at a different price.
  steak: BEEF_CUT, ribeye: BEEF_CUT, brisket: BEEF_CUT, rib: ANIMALS, chop: ANIMALS, roast: ANIMALS, tenderloin: ANIMALS,
  sirloin: ANIMALS, wing: ANIMALS, dog: [...ANIMALS, 'frank'], frank: ANIMALS, brat: [...ANIMALS, 'beer'], sausage: ANIMALS,
  turkey: ['frozen'], ham: ['honey', 'spiral', 'smoked', 'pork'],
  bun: ['hot', 'dog', 'hamburger', 'seed', 'sesame'], croissant: ['butter', 'mini'], flower: ['bouquet', 'cut', 'mixed'],
  pumpkin: ['pie', 'carving'], stuffing: ['mix', 'turkey', 'chicken', 'cornbread', 'herb', 'seasoned'],
  candy: ['snack', 'halloween', 'chocolate', 'assortment'], wrapper: ['wrap', 'round'], chip: ['potato', 'tortilla', 'kettle'],
  tortilla: ['taco', 'soft'], tortillas: ['taco', 'soft'], chocolate: ['bar', 'dark'], pea: ['dry', 'dried'], peas: ['dry', 'dried'], filling: ['mix'],
  watermelon: ['mini', 'seedless', 'personal'], bar: ['oat', 'honey'], bacon: ['smoked', 'hardwood', 'pork'],
}).map(([k, v]) => [k, new Set(v)]));
// Products that normally come in flavours, where a flavour word is the variety, not a different food.
const FLAVOR_OK_HEADS = new Set(['bar', 'chip', 'cereal', 'candy', 'soda', 'bread', 'ham', 'meat', 'cracker', 'cookie', 'sauce', 'bean', 'granola', 'applesauce']);

// Compound names that are a different product from the query word inside them. HEAD: the query
// word is the modifier ("peanut butter cups" are candy, "celery salt" a seasoning); fires when the
// query has a word of the phrase but not its last. MODIFIER: the query word is the head but the
// modifier changes it ("baking soda" is not soda); fires when the query has the last word but not
// the first. Both from the holiday matrix.
const HEAD_COMPOUNDS = ['peanut butter cup', 'bacon bit', 'corn flake', 'corn tortilla', 'flour tortilla', 'celery salt', 'celery seed',
  'onion salt', 'garlic salt', 'yogurt raisin', 'yogurt covered', 'yogurt pretzel', 'wine glass', 'glass set', 'champagne flute',
  'sugar free', 'charcoal toothpaste', 'chocolate milk',
  // BJ's "Wellsley Farms 12 Inch Pumpkin Pie" answered "pumpkin" (the Halloween run). "Pie Pumpkin" is a pumpkin.
  'pumpkin pie',
  // Celery root (celeriac) is another vegetable: Food Bazaar's "Celery Root (Knob)" answered "celery" (Thanksgiving, NYC).
  'celery root'];
const MODIFIER_COMPOUNDS = ['baking soda', 'cooking wine', 'creme egg', 'cadbury egg', 'chocolate egg', 'plastic egg', 'mini egg',
  'candy corn', 'corned beef brisket', 'cottage cheese', 'salisbury steak',
  // Scallions are not onions: ShopRite's "Green Onions (Scallions)" answered "onions" (Thanksgiving, NYC).
  'green onion', 'spring onion',
  // Fruit and nut butters, and margarine that says so: apple butter is not butter.
  'apple butter', 'pumpkin butter', 'shea butter', 'cocoa butter', 'not butter'];
// Tokenised with the matcher's own tokens() ("tortillas" stays "tortillas"), on first use: tokens()
// depends on constants declared further down this file.
let compounds = null;
const compoundTokens = () => (compounds ||= { head: HEAD_COMPOUNDS.map((p) => tokens(p)), modifier: MODIFIER_COMPOUNDS.map((p) => tokens(p)) });
function hasPhrase(words, phrase) {
  // Plural-blind: singular() keeps "tortillas" and "peas" (their -as ending), so compare stems.
  const stem = (w) => w.replace(/s$/, '');
  for (let i = 0; i + phrase.length <= words.length; i++) if (phrase.every((w, j) => stem(words[i + j]) === stem(w))) return true;
  return false;
}

// Canned and dried forms of vegetables and meats are different products from the fresh ones:
// "Del Monte Asparagus Spears Canned", "Libby's Corned Beef Canned". Frozen is not in this list:
// frozen green beans answer "green beans" (the Thanksgiving run), frozen wings answer "wings".
// Cuts of a bird or animal. A search naming one cut is not answered by another, whatever the aisle:
// Walmart files "Great Value Chicken Drumsticks" under Chicken Wings, and that category made it
// Birmingham's best chicken wings (the state x holiday audit).
const CUTS = new Set(['wing', 'drumstick', 'thigh', 'breast', 'leg', 'tenderloin', 'tender', 'gizzard', 'liver', 'neck', 'quarter', 'drumette']);
// Heads of fresh-produce searches (fruit is FRESH_FRUIT_RE), and the produce words that make a mix. Not
// words that also name a variety of something else: cherry/grape/pear tomatoes, orange/banana peppers.
const PRODUCE_HEAD_RE = /^(?:asparagus|carrot|celery|onion|cabbage|potato|cilantro|parsley|basil|choy|broccoli|spinach|kale|lettuce|mushroom|pepper|cucumber|zucchini|garlic|ginger|scallion|avocado)$/;
const PRODUCE_WORD_RE = /^(?:onion|tomato|tomatoe|jalapeno|pepper|garlic|carrot|celery|potato|lime|lemon|apple|banana|strawberry|blueberry|mango|pineapple|cucumber|spinach|kale|cilantro|parsley|basil|mushroom|corn|pea|bean|avocado)$/;
const FRESH_VEG_MEAT_RE = /^(?:asparagus|carrot|celery|onion|cabbage|potato|cilantro|choy|broccoli|spinach|kale|lettuce|mushroom|pepper|cucumber|zucchini|beef|brisket|ham|chicken|pork|lamb|turkey|steak)$/;
const SHELF_FORM_RE = /\b(?:canned|dehydrated|freeze[- ]?dried)\b/;

// Qualifiers that are just variants (never penalized).
const SOFT = new Set(['organic', 'lactose', 'free', 'ultra', 'filtered', 'reduced', 'fat', 'low', 'whole', 'skim', 'natural', 'grass', 'fed', 'pasture', 'raised', 'cage', 'large', 'medium', 'small', 'extra', 'jumbo', 'grade', 'fresh', 'boneless', 'skinless', 'lean', 'ground', 'bonein', 'skinon']);

export function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u00ae\u2122\u00a9]/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/(\d)\s*%/g, '$1%')
    .replace(/[^a-z0-9%.\s-]/g, ' ')
    .replace(/(?<![a-z0-9])-|-(?![a-z0-9])/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Nouns that already end in -ie, so their plural -ies is just an added s.
 *
 * English cannot decide this from the letters: "anchovies" -> "anchovy" but "brownies" ->
 * "brownie", and the two words rhyme. The -ies -> -y rule was turning "cookies" into "cooky", a
 * token that appears in neither TRAPS nor FLAVOR, so every cookie product in the catalog escaped
 * the penalty its singular form receives. That is how a 13 oz box of "Benton's Pecan Shortbread
 * Cookies" became ALDI's cheapest pecans at $2.77/lb in all four ZIPs, against real chopped pecans
 * at $7.18/lb in the same response, and how "Oatmeal Cranberry Cookies" became the cheapest fresh
 * cranberries. Only food words are listed: the point is to make TRAPS and FLAVOR fire, and a
 * mis-stemmed word that is in neither set costs nothing.
 */
const IE_PLURALS = new Set(['cookies', 'brownies', 'smoothies', 'veggies', 'hoagies']);

export function singular(w) {
  if (w.length <= 3 || /\d/.test(w)) return w;
  if (/(ss|us|is|as)$/.test(w)) return w;
  if (IE_PLURALS.has(w)) return w.slice(0, -1);
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
  if (/(oes)$/.test(w)) return w.slice(0, -2);
  if (/(ches|shes|xes|zes|sses)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('ves') && w.length > 5) return w.slice(0, -3) + 'f';
  if (w.endsWith('s')) return w.slice(0, -1);
  return w;
}

export function tokens(s) {
  const out = [];
  for (const raw of normalize(s).split(' ')) {
    if (!raw) continue;
    if (SYNONYMS[raw]) { out.push(...SYNONYMS[raw]); continue; }
    for (const part of raw.split('-')) if (part) out.push(singular(part.replace(/\.$/, '')));
  }
  return out;
}

// Product words that imply another word ("ground chuck" is ground beef).
const IMPLIES = { champagne: ['sparkling', 'wine'], prosecco: ['sparkling', 'wine'], cava: ['sparkling', 'wine'], frank: 'dog', chuck: 'beef', sirloin: 'beef', brisket: 'beef', ribeye: 'beef', kcup: 'coffee', 'k-cup': 'coffee', espresso: 'coffee', cage: 'egg', clementine: 'mandarin', cutie: 'mandarin', tp: 'toilet' };

function productTokens(s) {
  const t = tokens(s);
  for (const w of [...t]) if (IMPLIES[w]) t.push(...[].concat(IMPLIES[w]));
  return t;
}

export function queryTokens(q) {
  const t = tokens(q).filter((w) => !STOP.has(w));
  return t.length ? t : tokens(q);
}

/**
 * Score how well a product matches a query, 0..1.
 * product: { name, brand, category, rank, total }
 * opts: { include:[], exclude:[] }
 */
// Imitation markers: a product that says it merely tastes like the thing is not the thing.
// Flavoured waters named after the drink they taste of. Whole Foods' "Spiced Cider Sparkling Water"
// was Chicago's best price for sparkling cider in the Christmas run, "63% less" than real cider.
// Whole-name, because 'water' alone is not a trap: Carr's Table Water Crackers are crackers.
// Baby FOOD, found by what it is rather than by the word 'baby'. 'baby' was a trap, so Baby Spinach,
// Baby Carrots, Baby Gold Potatoes and Baby Swiss all scored 0.37 against their own names and were
// hidden (the St. Patrick's run: a bag of baby carrots never answered "carrots").
const BABY_PRODUCT_RE = /\bbaby (?:foods?|formula|wipes?|puree|cereal|shampoo|lotion|wash|oil|powder|snacks?|puffs|teethers?|yogurt melts)\b|\bgerber\b|\bbeech-?nut\b|\bstage [1-4]\b|\bfor babies\b/i;
const WANTS_BABY_RE = /\bbaby (?:food|formula|cereal|wipes?)\b|\bformula\b|\bgerber\b|\bbeech-?nut\b|\binfant\b|\btoddler\b/i;

// Fresh fruit bought loose, for the processed-category rule in relevance(). Not vegetables: frozen
// green beans are a fair answer to "green beans" (the Thanksgiving run), frozen banana slices are not.
const FRESH_FRUIT_RE = /\b(?:mandarins?|clementines?|tangerines?|bananas?|plantains?|apples?|oranges?|lemons?|limes?|grapefruits?|avocados?|mangos?|mangoes|pears?|peach(?:es)?|nectarines?|plums?|kiwis?|grapes?|strawberr(?:y|ies)|blueberr(?:y|ies)|raspberr(?:y|ies)|blackberr(?:y|ies)|cherr(?:y|ies)|pineapples?|melons?|watermelons?|cantaloupes?|tomato(?:es)?)\b/;
// Supplements named after a food: Natural Grocers' "NaturesPlus Apple Pectin 500 mg Tablets",
// 180 count, was Dallas's best "apples" at an estimated $0.30/lb (the nationwide audit).
// A dose alone is not enough: "Lactaid Milk with Vitamin D 400 IU" and "Eggland's Best, 125 mg
// Omega-3" are groceries. The pill's own form word is.
const SUPPLEMENT_RE = /\b(?:tablets?|caplets?|softgels?|vegcaps?|veggie caps|lozenges?|chewables?)\b/i;
const WANTS_SUPPLEMENT_RE = /\b(?:tablets?|caplets?|capsules?|softgels?|supplements?|vitamins?|pectin|lozenges?|chewable|mg|mcg)\b/i;
const PROCESSED_FORM_RE = /\bin (?:light |heavy )?(?:syrup|juice)\b|\b(?:canned|diced|crushed|stewed|sun[- ]?dried|freeze[- ]?dried|dried|dehydrated|pureed?|frozen)\b/;
const LUNCH_NAME_RE = /\b(?:deli|sliced|lunchmeat|lunch meat|cold cuts?)\b/;
const LUNCH_CAT_RE = /\b(?:deli|lunch ?meats?|lunchmeat|cold cuts?)\b/;
const NON_FOOD_CATEGORY_RE = /\b(?:supplements?|vitamins?|cough|cold and flu|pain relief|first aid|toothpicks?|party (?:supplies|decorations)|decorations?|decor|gift bags?|crafts?|disposable|cutlery|utensils?|tableware|paper (?:goods|products)|napkins?|herbal tea|pet (?:food|treats|supplies)|dog|cat)\b/;
// "pumpkin" on its own is a pumpkin to carve. Mini and ornamental pumpkins are table decorations at
// a dollar or two, and priced per pumpkin they beat every carving pumpkin: Trader Joe's "Lil' Tiger
// Stripe Pumpkin" was the best pumpkin in four states, Rouses' "Licensed LSU Tigers Pumpkin" (8 ct)
// in New Orleans (the Halloween run). Asking for them finds them. The rerun (21 Oct) added Fresh
// Thyme's "Tiger Striped Pumpkin", the same one without the "Lil'". These ARE produce, filed under
// Pumpkin, so the whole-pumpkin rule below cannot tell them apart: this one is about size.
const DECORATIVE_PUMPKIN_RE = /\b(?:mini|miniature|ornamental|decorative|decor|jack be little|wee b(?:ee)? little|tigers?|licensed)\b/;
// ...and it is a pumpkin, not a thing shaped like one. Each round added the last round's impostors
// to a blocklist (pails, buckets, Walmart's "Poppin Pumpkin Snaps"), and the third (24 Oct) found a
// new set: ALDI's "Kirkton House Pumpkins Vinyl Tablecloth" was Phoenix's cheapest pumpkin, Fry's
// "Klein International Glow Fun Pumpkin Eye Mask" and ALDI's "The Halloween Collection Pumpkin Ice
// Mold" were the best pumpkin in Phoenix and Minneapolis. So a pumpkin search asks for evidence of a
// whole pumpkin: sold by the pound, filed in a produce aisle, weighing pounds, or named as one.
//
// Named as one does not mean "ends in Pumpkin". The first version of this rule read word order, and
// the live rerun on it (26 Oct) found ALDI's "Kirkton House Fall Napkins, Pumpkin" as the best
// pumpkin in nine states and Martin's "BGL Pumpkin RSN" (a pumpkin raisin bagel) in Baltimore, while
// Vallarta's "Pumpkin, Casper" failed. A whole-pumpkin name is made only of pumpkin words (sizes,
// colours, counts, "pie", "sugar", "carving", a variety), or carries a mark that only a whole pumpkin
// has: "Jack-O-Lantern", "Heirloom", "Carving", a variety name ("Rent's Due Ranch Local Organic
// |Jack-O-Lantern Pumpkins"). An aisle that is party goods, paper goods or a bakery is evidence
// against, whatever the name says.
const PRODUCE_CATEGORY_RE = /\b(?:produce|vegetables?|veggies|fruits?|pumpkins?|squash|gourds?)\b/;
const NOT_PRODUCE_CATEGORY_RE = /\b(?:party|paper|napkins?|tableware|disposables?|bakery|breads?|baked|pastr(?:y|ies)|bagels?|donuts?|muffins?|decor|decorations?|crafts?|candy|snacks?|beer|wine|spirits|coffee|beverages?|home|kitchen|frozen|canned)\b/;
const PRODUCE_AISLE_RE = /\b(?:produce|vegetables?|veggies)\b/;
const PUMPKIN_VARIETIES = ['casper', 'sparkler', 'cinderella', 'fairytale', 'jarrahdale', 'howden', 'lumina', 'knucklehead', 'lolita', 'connecticut', 'galeux', 'eysines', 'porcelain', 'warty', 'goblin', 'kabocha', 'cushaw', 'rouge', 'vif', 'etampes', 'musque', 'provence', 'valenciano', 'peanut'];
const PUMPKIN_MARKS = new Set(['lantern', 'heirloom', 'carving', ...PUMPKIN_VARIETIES]);
const PUMPKIN_WORDS = new Set(['pumpkin', 'pie', 'sugar', 'jack', 'o', 'each', 'ea', 'ct', 'count', 'lb', 'pound', 'oz', 'size', 'assorted', 'color', 'colour', 'variety', 'large', 'medium', 'small', 'jumbo', 'extra', 'giant', 'big', 'max', 'field', 'orange', 'white', 'green', 'red', 'blue', 'gray', 'grey', 'tan', 'bin', 'weight', 'between', 'approx', 'approximately', 'avg', 'average', 'organic', 'fresh', 'local', 'locally', 'grown', 'regular', 'whole', 'halloween', 'fall', 'autumn', 'harvest', 'per', 'x', 'to', 'and', 'or',
  // Small and ornamental pumpkins are still pumpkins; DECORATIVE_PUMPKIN_RE keeps them out of a bare search.
  'mini', 'miniature', 'wee', 'b', 'bee', 'little', 'lil', 'ornamental', 'baby', 'boo', 'tiger', 'stripe', 'striped', ...PUMPKIN_MARKS]);
const WHOLE_PUMPKIN_MIN_OZ = 32;
function wholePumpkinName(words) {
  if (!words.includes('pumpkin')) return false;
  if (words.some((w) => PUMPKIN_MARKS.has(w))) return true;
  return words.every((w) => PUMPKIN_WORDS.has(w) || /^\d+(?:\.\d+)?(?:lb|oz|ct)?$/.test(w));
}
function wholePumpkin(product, words) {
  const cat = normalize(product.category || '');
  if (NOT_PRODUCE_CATEGORY_RE.test(cat) && !PRODUCE_AISLE_RE.test(cat)) return false;
  if (product.soldBy === 'lb') return true;
  if (PRODUCE_CATEGORY_RE.test(cat)) return true;
  if (product.dim === 'weight' && product.base >= WHOLE_PUMPKIN_MIN_OZ) return true;
  return wholePumpkinName(words);
}
// A whole pumpkin weighs pounds. A pumpkin sold by the piece with a net weight under 2 lb is a can or
// a pouch: Walmart's "Great Value Pumpkin", 15 oz, was Philadelphia's best pumpkin (the rerun), and
// nothing in its name says it is puree.
const CANNED_PUMPKIN_MAX_OZ = 32;
// A dish named as a flavour. "Pumpkin pie spice" is kept out of "pumpkin pie" by the 'spice' trap;
// the same is true of a caramel apple: Walmart's "Tootsie Pops Assorted Caramel Apple Pops Variety
// Pack", 13.64 oz, was the best caramel apples in Anchorage and Honolulu (the live rerun, 26 Oct).
// When the query is one of these dishes, a name that is a confection, a drink, a scent or a
// cosmetic in its flavour is not the dish. Asking for the form ("caramel apple pops") finds it.
const FLAVOUR_DISH_RE = /\b(?:caramel|candy|candied) apples?\b|\b(?:pumpkin|apple|pecan|sweet potato) pies?\b/;
const FLAVOUR_FORM_RE = /\b(?:pops?|lollipops?|suckers?|hard candy|candies|taffy|chews?|gum|jelly beans?|gumm(?:y|ies)|scented|scents?|fragrance|coffee|creamer|k-?cups?|pods|lip balm|balm|lotion|soap|syrup|soda|latte|tea bags?|flavou?r(?:ed|s)?|variety pack)\b/;
const WATER_DRINK_RE = /\b(?:sparkling|mineral|spring|flavou?red|still|infused) water\b|\bseltzer\b|\bla croix\b/i;
const WANTS_WATER_RE = /\bwater\b|\bseltzer\b|\bla croix\b/i;

// Juice-flavoured drinks. Costco's "Sunny D Citrus Punch" is filed under Orange Juice, and that
// category alone scored it 0.87: it was Minneapolis's best orange juice (the nationwide audit), and
// ALDI names the same bottle "Sunnyd Tangy Original Orange Juice". A punch or a "juice drink" is
// not juice. "From concentrate" IS juice (BENIGN_AFTER); a can of frozen concentrate is not.
const JUICE_IMPOSTOR_RE = /\bpunch\b|\b(?:orange|lemon|lime|cherry|grape|power|gator)ade\b|\bjuice (?:drink|beverage|cocktail blend)s?\b|\bsunny ?d\b|\bhi[- ]?c\b|\bkool[- ]?aid\b|\bcapri ?sun\b|\btampico\b|\bdrink mix\b/i;
const WANTS_JUICE_DRINK_RE = /\bpunch\b|\bdrinks?\b|\bbeverage\b|\bsunny ?d\b|\bhi[- ]?c\b|\bkool[- ]?aid\b|\bcapri ?sun\b|\btampico\b/i;

const IMITATION_RE = /\btastes?\s+like\b|\bimitation\b|\b(?:butter|cheese|milk|meat|crab)[- ]style\b|\balternative to\b|\bsubstitute\b/i;
// ...unless the shopper is looking for the imitation category itself, in which case a name like
// "Tastes Like Butter Margarine" is exactly what they asked for.
const IMITATION_CATEGORY_RE = /\bmargarine|spreads?|substitutes?|alternatives?|non-?dairy|plant[- ]?based|vegan\b/i;

export function relevance(query, product, opts = {}) {
  const qt = queryTokens(query);
  if (!qt.length) return 0.5;
  const nameNorm = normalize(`${product.brand || ''} ${product.name || ''}`);
  const nameTok = new Set(productTokens(`${product.brand || ''} ${product.name || ''}`));
  // Shoppers say "lunch meat"; labels say "Deli Fresh", "Sliced", "Lunchmeat", and aisles "Deli Meat". Omaha's
  // "turkey lunch meat" found nothing in the state x holiday audit.
  if (LUNCH_NAME_RE.test(normalize(product.name || '')) || LUNCH_CAT_RE.test(normalize(product.category || ''))) { nameTok.add('lunch'); nameTok.add('meat'); }
  const selfTok = new Set(productTokens(product.name || ''));
  const brandTok = new Set(productTokens(product.brand || ''));
  const catTok = new Set(tokens(product.category || ''));

  // A word that appears ONLY in the brand counts as a match when it identifies the product
  // ("Kerrygold" for a kerrygold search) but NOT when it is a generic grocery qualifier, because
  // then it is almost always part of the retailer's own trading name rather than a description.
  // "365 By Whole Foods Market" supplied the word "whole" to every one of its products, so a
  // search for "whole turkey" in Milwaukee headlined $5.99/lb ground turkey while Woodman's real
  // $1.69/lb birds scored below the cut. The same leak skews "whole milk", "whole wheat" and
  // "fresh" toward whichever chain has the word in its name.
  const fromBrandOnly = (t) => !selfTok.has(t) && brandTok.has(t);
  const generic = (t) => SOFT.has(t) || MILD.has(t) || STOP.has(t);

  for (const ex of opts.exclude || []) {
    const et = tokens(ex);
    if (et.length && et.every((t) => nameTok.has(t))) return 0;
  }
  for (const inc of opts.include || []) {
    const it = tokens(inc);
    if (it.length && !it.every((t) => nameTok.has(t) || catTok.has(t))) return 0;
  }

  // A product the retailer itself filed under the exact phrase the shopper typed is the strongest
  // evidence in the record — stronger than the product name, which is a marketing string. Scoring
  // a category hit at 0.6 of a name hit meant "Jennie-O Less Than 14 Pounds Turkey", category
  // "Whole Turkey", reached only 0.52 against a 0.55 cut: 1.6/2 coverage plus the 0.08 head-noun
  // bonus. Every category-only whole bird in Kenosha and Milwaukee was therefore hidden, and a
  // $2.99/lb online listing answered a question Woodman's was answering at $1.89/lb on the shelf.
  //
  // A category that ALSO names a different food does not count, or the aisle sign starts matching
  // instead of the product: Trader Joe's files apricot preserves under "Nut Butters & Fruit
  // Spreads", which contains "butter", and chicken thighs under "Chicken & Turkey".
  // A category that names a processed FORM covers only a shopper who asked for that form: "Dried
  // Bananas" filed Key Food's freeze-dried banana snack, and "Frozen Bananas" Kroger's frozen
  // slices, as each store's price for "bananas" (the capture sweep). Only when the query's head is a
  // fresh fruit (not "apple juice" or "tomato sauce"):
  // frozen raw chicken breasts are chicken breasts, frozen green beans are green beans.
  const processedCat = FRESH_FRUIT_RE.test(qt[qt.length - 1] || '') && [...catTok].some((w) => ['dried', 'dehydrated', 'freeze', 'canned', 'frozen'].includes(w) && !qt.includes(w));
  const catCoversQuery =
    catTok.size > 0 && qt.every((t) => catTok.has(t)) && !processedCat && ![...catTok].some((w) => TRAPS.has(w) && !new Set(qt).has(w));

  // The same words are invisible to the prefix fallback below, or "Whole Foods Market" would hand
  // the query word back through `n.startsWith(t)` at 0.7 instead of 1.
  const hitTok = [...nameTok].filter((n) => !(fromBrandOnly(n) && generic(n)));

  let hits = 0;
  for (const t of qt) {
    if (nameTok.has(t) && !(fromBrandOnly(t) && generic(t))) hits += 1;
    else if (catTok.has(t)) hits += catCoversQuery ? 1 : 0.6;
    else if (t.length >= 5 && hitTok.some((n) => n.startsWith(t) || (n.length >= 5 && t.startsWith(n)))) hits += 0.7;
  }
  const coverage = hits / qt.length;
  let score = coverage >= 1 ? 0.8 : coverage * 0.55;

  const qNorm = normalize(query);
  if (qNorm && nameNorm.includes(qNorm)) score += 0.12;

  if (catTok.size && catTok.has(qt[qt.length - 1]) && !processedCat) score += 0.08;

  // Position-aware penalties around the head noun (the last query word).
  const head = qt[qt.length - 1];
  const words = tokens(product.name || '');
  const qset = new Set(qt);
  const headIdx = words.lastIndexOf(head);
  let mult = 1;
  // "Greek Yogurt made with Whole Milk", "Pasta with Eggs": the searched noun is only an ingredient
  if (headIdx > 0) {
    const before = words.slice(Math.max(0, headIdx - 3), headIdx);
    if (before.some((w) => w === 'with' || w === 'made' || w === 'from' || w === 'in') && words.slice(0, headIdx).some((w) => TRAPS.has(w) && !qset.has(w))) mult *= 0.3;
  }
  const allowed = new Set(qt.flatMap((q) => [...(QUERY_ALLOWS[q] || [])]));
  if (headIdx >= 0) {
    let strong = 0;
    // Look on BOTH sides of the head noun. A trap word before it is just as disqualifying as one
    // after: "peanut butter" is not butter and "cream cheese" is not cheese, but scoring only the
    // words after the head let both through as genuine matches.
    for (let i = 0; i < words.length; i++) {
      if (i === headIdx) continue;
      const w = words[i];
      if (qset.has(w) || SOFT.has(w) || allowed.has(w)) continue;
      if (words[i - 1] === 'in' || words[i - 1] === 'with' || words[i - 2] === 'in') continue; // "tuna in oil", "with sauce"
      if (BENIGN_AFTER[w]?.has(words[i - 1])) continue; // "sweet cream butter" is plain butter
      if (BENIGN_BEFORE[w]?.has(words[i + 1])) continue; // "oyster mushrooms" are mushrooms
      if (TRAPS.has(w)) strong += 1;
    }
    let alt = 0;
    let mild = 0;
    let flavor = 0;
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (qset.has(w) || allowed.has(w)) continue;
      // Position-independent: "Frozen Orange Juice" and "Orange Juice Frozen" are the same
      // product and must score the same. Anchoring these to the head noun meant word order alone
      // changed the score by a factor of two.
      if (ALT_BASE.has(w)) alt += 1;
      else if (FLAVOR.has(w) && !qt.some((q) => INHERENT_FLAVOR[q]?.has(w)) && !FLAVOR_OK_HEADS.has(head)) flavor += 1;
      // When the retailer filed the product under exactly what was searched, a storage word in the
      // name describes a variant OF that category rather than a different product. "Jennie-O Whole
      // Frozen Turkey" in category "Frozen Whole Turkey" scored 0.510 against a 0.55 cut purely
      // because of 'frozen', so every frozen bird in Chicago, Milwaukee and Kenosha was hidden and
      // the Thanksgiving centrepiece was answered with ground turkey at 3.5x the price.
      else if (MILD.has(w)) { if (!(catCoversQuery && STORAGE_STATE.has(w))) mild += 1; }
    }
    mult *= Math.pow(0.4, Math.min(strong, 3)) * Math.pow(0.55, Math.min(alt, 2)) * Math.pow(0.58, Math.min(mild, 3)) * (flavor ? 0.5 : 1);
  } else {
    let traps = 0;
    for (const w of new Set(words)) if (TRAPS.has(w) && !qset.has(w) && !allowed.has(w)) traps += 1;
    mult *= Math.pow(0.6, Math.min(traps, 3));
  }
  // "Tastes Like Butter" is margarine. Only penalize when the shopper did not ask for it.
  const wantsImitation = IMITATION_RE.test(normalize(query)) || IMITATION_CATEGORY_RE.test(normalize(query));
  if (IMITATION_RE.test(nameNorm) && !wantsImitation) mult *= 0.3;
  if (WATER_DRINK_RE.test(nameNorm) && !WANTS_WATER_RE.test(normalize(query))) mult *= 0.3;
  // "Chicken a la King" is a frozen dinner and "Coffee a la Jaggery" (Kimbala, 10.2 oz, Dallas's
  // best coffee in the audit) a sweetened mix: "<the thing> a la <style>" names a prepared dish.
  // Not "a la carte" (sold separately) or "a la mode".
  { const q = normalize(query); if (!/\ba la\b/.test(q) && new RegExp(`(?:^|\\s)${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} a la (?!carte\\b|mode\\b)`).test(nameNorm)) mult *= 0.3; }
  // A processed form of fresh fruit is not the fruit: "Diced Canned Tomatoes" at $0.83/lb was Salt
  // Lake City's best "tomatoes" (the nationwide audit). Asking for the form finds it.
  if (FRESH_FRUIT_RE.test(qt[qt.length - 1] || '')) {
    const q = normalize(query).replace(/-/g, ' ');
    const forms = nameNorm.match(new RegExp(PROCESSED_FORM_RE.source, 'g')) || [];
    if (forms.length && !forms.some((f) => q.includes(f.replace(/-/g, ' ')))) mult *= 0.3;
  }
  {
    const qstems = new Set(qt.map((w) => w.replace(/s$/, '')));
    const inQ = (w) => qstems.has(w.replace(/s$/, ''));
    for (const p of compoundTokens().head) if (hasPhrase(words, p) && p.slice(0, -1).some(inQ) && !inQ(p[p.length - 1])) { mult *= 0.2; break; }
    for (const p of compoundTokens().modifier) if (hasPhrase(words, p) && inQ(p[p.length - 1]) && !inQ(p[0])) { mult *= 0.2; break; }
  }
  {
    const qCut = qt.find((w) => CUTS.has(w));
    if (qCut && words.some((w) => CUTS.has(w) && w !== qCut && !qset.has(w)) && !words.includes(qCut)) mult *= 0.2;
  }
  // "Marzetti Glaze for Strawberries" is something to use WITH strawberries; it was Little Rock's best
  // "strawberries" (the state x holiday audit). Same for a dip for apples, a rub for ribs.
  if (head && !qset.has('for') && new RegExp(`\\bfor (?:[a-z]+ ){0,2}${head.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(words.join(' '))) mult *= 0.2;
  // Champagne grapes are grapes, not the champagne IMPLIES reads into the name.
  if (/\bchampagne grapes?\b/.test(nameNorm) && !/\bgrape/.test(normalize(query))) mult *= 0.2;
  // Fresh produce searches: a product naming a DIFFERENT produce item is a mix ("Chopped Cilantro & White
  // Onions", "Diced Tomatoes with Jalapeno And Cilantro" won "cilantro"), and a juice aisle is juice
  // ("Cold Pressed Celery", Pressed Juices, won "celery"). The state x holiday audit.
  if (FRESH_FRUIT_RE.test(head || '') || PRODUCE_HEAD_RE.test(head || '')) {
    const others = words.filter((w) => !qset.has(w) && PRODUCE_WORD_RE.test(w) && !qt.some((q) => q.startsWith(w) || w.startsWith(q)));
    if (others.length) mult *= 0.3;
    if (catTok.has('juice') || catTok.has('juices') || catTok.has('pressed')) { if (!qset.has('juice')) mult *= 0.3; }
  }
  // "Garden Sweet Russet Potato" answered "sweet potatoes": another potato entirely.
  if (head === 'pumpkin' && DECORATIVE_PUMPKIN_RE.test(nameNorm) && !DECORATIVE_PUMPKIN_RE.test(normalize(query))) mult *= 0.2;
  if (head === 'pumpkin' && !wholePumpkin(product, words)) mult *= 0.2;
  if (FLAVOUR_DISH_RE.test(normalize(query)) && FLAVOUR_FORM_RE.test(nameNorm) && !FLAVOUR_FORM_RE.test(normalize(query))) mult *= 0.2;
  if (head === 'pumpkin' && product.soldBy !== 'lb' && product.dim === 'weight' && product.base > 0 && product.base < CANNED_PUMPKIN_MAX_OZ) mult *= 0.2;
  if (/\bsweet potato/.test(normalize(query)) && /\b(?:russet|yukon|red potato|gold potato|white potato)/.test(nameNorm)) mult *= 0.2;
  if (FRESH_VEG_MEAT_RE.test(head || '')) {
    const m = SHELF_FORM_RE.exec(nameNorm);
    if (m && !normalize(query).includes(m[0])) mult *= 0.3;
    // The aisle says it when the name does not: ALDI's "Brookdale Corned Beef", 12 oz, is canned
    // corned beef, and it was Phoenix's best "corned beef" for St. Patrick's Day.
    else if (!m && catTok.has('canned') && !qset.has('canned')) mult *= 0.3;
  }
  if (/\bjuice\b/.test(normalize(query)) && JUICE_IMPOSTOR_RE.test(nameNorm) && !WANTS_JUICE_DRINK_RE.test(normalize(query))) mult *= 0.3;
  if (BABY_PRODUCT_RE.test(nameNorm) && !WANTS_BABY_RE.test(normalize(query))) mult *= 0.2;
  // Books, cookware and apparel that happen to name a food. Applied to the whole name because the
  // position rules deliberately look past "in"/"with" phrases, which is where the giveaway sits.
  if (NON_GROCERY_RE.test(nameNorm)) mult *= 0.15;
  else if (NON_FOOD_RE.test(nameNorm) && !NON_FOOD_RE.test(normalize(query))) mult *= 0.15;
  // The retailer's own aisle says it is not food: "Solaray Passion Flower" (Herbal Supplements) and "Hello Hobby
  // Satin Flowers" (Party Decorations) answered "flowers", Luden's watermelon drops (Cough Suppressants)
  // "watermelon", "Apple Sticks" (Toothpicks) "apples" (the state x holiday audit).
  if (NON_FOOD_CATEGORY_RE.test(normalize(product.category || '')) && !NON_FOOD_CATEGORY_RE.test(normalize(query))) mult *= 0.15;
  if (SUPPLEMENT_RE.test(nameNorm) && !WANTS_SUPPLEMENT_RE.test(normalize(query))) mult *= 0.15;

  score *= mult;

  // The store's own ranking is a useful tiebreaker.
  if (product.rank != null && product.total > 1) score *= 1 - 0.15 * (product.rank / product.total);

  return Math.max(0, Math.min(1, score));
}

export const RELEVANT = 0.55;

// Words that make useless refine chips (packaging, marketing, and things with their own filter)
const CHIP_NOISE = new Set(['carton', 'bottle', 'jug', 'container', 'package', 'bag', 'box', 'can', 'jar', 'each', 'value', 'family', 'size', 'select', 'original', 'classic', 'premium', 'organic', 'brand', 'pack', 'count', 'ounce', 'gallon', 'gal', 'quart', 'half', 'pint', 'fl', 'lb', 'lbs', 'oz', 'ct', 'with', 'made', 'great', 'best', 'store', 'kroger', 'signature', 'good', 'gather', 'market', 'pantry', 'farm', 'farms', 'simple', 'truth', 'nature', 'kirkland', '365', 'everyday', 'item', 'items']);

/**
 * Suggest refinement chips from the words that appear in relevant results
 * (e.g. "whole", "2%", "organic", "lactose free" for "milk").
 */
export function refineChips(query, products, max = 10) {
  const qt = new Set(queryTokens(query));
  const counts = new Map();
  const brands = new Set(products.flatMap((p) => normalize(p.brand || '').split(' ')).filter((w) => w.length > 2).map(singular));
  for (const p of products) {
    const seen = new Set();
    const words = normalize(p.name || '').split(' ');
    for (let i = 0; i < words.length; i++) {
      const w = singular(words[i]);
      if (!w || qt.has(w) || STOP.has(w) || CHIP_NOISE.has(w) || (w.length < 3 && !/%$/.test(w))) continue;
      if (/^\d+(\.\d+)?$/.test(w) || /^\d+(oz|lb|ct|gal|fl)$/.test(w)) continue;
      if (brands.has(w)) continue;
      let chip = words[i];
      if (w === 'lactose' && words[i + 1] === 'free') chip = 'lactose free';
      if (w === 'cage' && words[i + 1] === 'free') chip = 'cage free';
      if (w === 'grass' && /^fed/.test(words[i + 1] || '')) chip = 'grass fed';
      if (w === 'free' && ['lactose', 'cage', 'gluten', 'sugar'].includes(words[i - 1])) continue;
      if (w === 'fed' && words[i - 1] === 'grass') continue;
      if (seen.has(chip)) continue;
      seen.add(chip);
      counts.set(chip, (counts.get(chip) || 0) + 1);
    }
  }
  const n = products.length || 1;
  return [...counts.entries()]
    .filter(([, c]) => c >= 2 && c <= n * 0.85)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([chip, count]) => ({ chip, count }));
}

/** Stable key for a product at a store (for history). */
export function productKey(storeId, id) {
  return `${storeId}:${id}`;
}
