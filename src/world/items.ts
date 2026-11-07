// Every loose object in the world is an item actor with a body. These are the shared definitions.
export type ItemType =
  | 'apple' | 'bread' | 'cheese' | 'book' | 'ledger' | 'pot' | 'jug' | 'barrel' | 'crate' | 'bucket'
  | 'hammer' | 'candle' | 'pouch' | 'herb' | 'log' | 'stoneChunk' | 'draught' | 'stool' | 'basket' | 'lantern'
  | 'tomeBolt' | 'tomeMend' | 'lockpicks' | 'strongbox';

export interface ItemDef {
  name: string;
  desc: string;
  value: number;
  radius: number;
  mass: number;
  height: number;
  /** Small enough to stow in the pack. Everything can still be lifted and thrown. */
  take: boolean;
  heal?: number;
  stock?: 'wood' | 'stone';
  gold?: number;
  read?: string;
}

export const ITEMS: Record<ItemType, ItemDef> = {
  apple: { name: 'Apple', desc: 'Crisp, a little bruised.', value: 2, radius: 0.12, mass: 0.2, height: 0.16, take: true, heal: 6 },
  bread: { name: 'Loaf of bread', desc: 'Still faintly warm.', value: 4, radius: 0.2, mass: 0.4, height: 0.18, take: true, heal: 12 },
  cheese: { name: 'Wheel of cheese', desc: 'Wrapped in waxed cloth.', value: 7, radius: 0.2, mass: 0.8, height: 0.14, take: true, heal: 16 },
  book: {
    name: 'Worn almanac', desc: 'Thumbed soft at the corners.', value: 8, radius: 0.17, mass: 0.6, height: 0.07, take: true,
    read: 'Plant after the third frost. Mind the stones on the west field: the first keepers set them, each with its proper sign cut low on the base.',
  },
  ledger: {
    name: "Tobin's ledger", desc: 'Leather-bound. The clasp has been forced.', value: 10, radius: 0.18, mass: 0.6, height: 0.07, take: true,
    read: 'Columns of careful sums. Every new moon the same entry: "Southern camp, safe passage, 12 crowns."',
  },
  pot: { name: 'Clay pot', desc: 'Empty, smelling faintly of lard.', value: 2, radius: 0.22, mass: 1, height: 0.32, take: true },
  jug: { name: 'Water jug', desc: 'Half full. It sloshes.', value: 3, radius: 0.17, mass: 0.9, height: 0.36, take: true },
  barrel: { name: 'Barrel', desc: 'Heavy. Something liquid inside.', value: 0, radius: 0.42, mass: 6, height: 0.95, take: false },
  crate: { name: 'Supply crate', desc: 'Nailed shut. Built to be stacked and carried.', value: 0, radius: 0.5, mass: 5, height: 0.9, take: false },
  bucket: { name: 'Bucket', desc: 'The rope handle is fraying.', value: 2, radius: 0.24, mass: 1.2, height: 0.36, take: true },
  hammer: { name: "Mason's hammer", desc: 'The handle is dark from years of hands.', value: 9, radius: 0.2, mass: 1.4, height: 0.1, take: true },
  candle: { name: 'Tallow candle', desc: 'Burned halfway down.', value: 1, radius: 0.08, mass: 0.1, height: 0.2, take: true },
  pouch: { name: 'Coin pouch', desc: 'It clinks.', value: 12, radius: 0.12, mass: 0.3, height: 0.1, take: true, gold: 12 },
  herb: { name: 'Woundwort', desc: 'Bitter leaves that close cuts.', value: 4, radius: 0.12, mass: 0.1, height: 0.12, take: true, heal: 14 },
  log: { name: 'Split log', desc: 'Good timber.', value: 3, radius: 0.32, mass: 3, height: 0.3, take: true, stock: 'wood' },
  stoneChunk: { name: 'Cut stone', desc: 'A squared block of grey stone.', value: 3, radius: 0.28, mass: 4, height: 0.3, take: true, stock: 'stone' },
  draught: { name: 'Healing draught', desc: 'Tastes of honey and copper.', value: 20, radius: 0.1, mass: 0.3, height: 0.22, take: true, heal: 55 },
  stool: { name: 'Stool', desc: 'Three legs, one of them short.', value: 0, radius: 0.28, mass: 2, height: 0.45, take: false },
  basket: { name: 'Wicker basket', desc: 'Woven tight. Good for carrying.', value: 0, radius: 0.3, mass: 1.2, height: 0.3, take: false },
  lantern: { name: 'Iron lantern', desc: 'Soot-blackened glass.', value: 6, radius: 0.15, mass: 0.8, height: 0.32, take: true },
  tomeBolt: {
    name: 'A Primer of Sparks', desc: 'A singed little book, smelling of ash.', value: 14, radius: 0.17, mass: 0.6, height: 0.07, take: true,
    read: 'The spark obeys a steady will. Picture the strike, spend the breath, let go. (You can now cast Spark bolt.)',
  },
  tomeMend: {
    name: 'The Mending Verse', desc: 'A hymn written as instructions.', value: 14, radius: 0.17, mass: 0.6, height: 0.07, take: true,
    read: 'Lay the hand near, not on, the hurt. Hum the third line. Mean it. (You can now cast Mending.)',
  },
  lockpicks: { name: 'Lockpicks', desc: 'Slim steel, oiled and ready.', value: 6, radius: 0.1, mass: 0.1, height: 0.05, take: true },
  strongbox: { name: 'Iron-banded strongbox', desc: 'Heavy, and locked.', value: 0, radius: 0.36, mass: 9, height: 0.42, take: false },
};
