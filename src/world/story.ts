// Quests and conversation. Guidance lives in what people say and what objects reveal.
import type { Actor, FoeKind, Point, SandboxWorld } from './simulation';
import type { ItemType } from './items';

export interface StoryReply { line: string; end?: boolean; shop?: boolean; options?: StoryOption[] }
export interface StoryOption { id: string; text: string; run: (w: SandboxWorld, npc: Actor) => StoryReply }
export interface QuestStage {
  journal: (w: SandboxWorld, id: string) => string;
  target?: (w: SandboxWorld, id: string) => Point | undefined;
  update?: (w: SandboxWorld, id: string) => string | undefined;
}
export interface QuestAliases {
  locationId: string;
  locationActorId: string;
  personId?: string;
  itemActorId?: string;
  itemType?: ItemType;
  enemyId?: string;
  enemyType?: FoeKind;
}
interface RadiantBase {
  patronId: string;
  siteId: string;
  siteName: string;
  siteActorId: string;
  point: Point;
  reward: number;
  aliases: QuestAliases;
}
export interface RescueQuestData extends RadiantBase {
  kind: 'rescue';
  captiveId: string;
  captiveName: string;
  // Retained for saves created by the original one-off rescue quest.
  dungeonId: string;
  dungeonName: string;
  dungeonActorId: string;
  originalPoint: Point;
  guardCount: number;
  approach: string;
  rescued?: boolean;
}
export interface RetrieveQuestData extends RadiantBase {
  kind: 'retrieve';
  itemType: ItemType;
  itemName: string;
  itemActorId: string;
  recovered?: boolean;
}
export interface HuntQuestData extends RadiantBase {
  kind: 'hunt';
  enemyType: FoeKind;
  enemyName: string;
  enemyId: string;
  defeated?: boolean;
}
export type DynamicQuestData = RescueQuestData | RetrieveQuestData | HuntQuestData;
export interface QuestDef {
  id: string;
  title: string;
  stages: Record<string, QuestStage>;
  talk?: (w: SandboxWorld, npc: Actor, stage: string | undefined) => StoryOption[];
}

const at = (a?: Actor): Point | undefined => (a ? { x: a.x, z: a.z } : undefined);
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const opt = (id: string, text: string, run: StoryOption['run']): StoryOption => ({ id, text, run });

export const QUESTS: Record<string, QuestDef> = {
  light: {
    id: 'light',
    title: 'The Light We Keep',
    stages: {
      meet: { journal: () => 'Mara, the Keeper, asked to see me in the village square.', target: (w) => at(w.npc('Mara')) },
      supply: {
        journal: (w) => `Mara needs timber and stone for the village's defences. The old trees and the stone deposits near the square will give them up, or Tobin may sell from the village stores. (${Math.min(w.stock.wood, 6)} of 6 timber, ${Math.min(w.stock.stone, 4)} of 4 stone)`,
        target: (w) => at(w.nearest('tree')),
        update: (w) => (w.stock.wood >= 6 && w.stock.stone >= 4 ? 'build' : undefined),
      },
      build: {
        journal: () => 'With timber and stone in hand, I should raise an archer tower near the Citadel. Iona keeps the plans.',
        target: (w) => at(w.npc('Iona')),
        update: (w) => (w.actors.some((a) => a.alive && a.structure === 'archer' && a.faction === 'citadel') ? 'stones' : undefined),
      },
      stones: {
        journal: (w) => `Three standing stones west of the square have woken. Each face must match the sign cut into its base. (${w.runesSolved()} of 3)`,
        target: (w) => at(w.actors.find((a) => a.kind === 'rune' && a.currentRune !== a.targetRune)),
        update: (w) => {
          if (w.runesSolved() < 3) return undefined;
          w.stock.essence += 1;
          return 'defend';
        },
      },
      defend: {
        journal: () => 'The stones have answered, and the wild camp to the south will have heard. When I am ready, the warning bell beside the Citadel will draw them out. Or I could take the fight to their camp.',
        target: (w) => at(w.actors.find((a) => a.kind === 'bell')),
        update: (w) => (w.waveCleared > 0 || w.wildCampCount() === 0 ? 'report' : undefined),
      },
      report: { journal: () => 'The Citadel held. Mara will want to hear it from me.', target: (w) => at(w.npc('Mara')) },
    },
    talk: (_w, npc, stage) => {
      if (npc.name === 'Mara') {
        if (stage === 'meet') return [opt('light-meet', 'You sent for me?', (world) => {
          world.setStage('light', 'supply');
          return { line: 'You came. Good. The light has held three winters, but the wilds have started to build. We need defences, and defences need timber and stone. The old trees past the road split well, and there is stone in the deposits beyond the square.' };
        })];
        if (stage === 'supply') return [opt('light-supply', 'Where do I find timber?', () => ({ line: 'Any of the old-growth trees. Chop, then pick up what falls. Tobin sells from the village stores too, if you would rather spend crowns than sweat.' }))];
        if (stage === 'build') return [opt('light-build', 'How do I raise a tower?', () => ({ line: 'Talk to Iona. She drew the plans. Somewhere near the Citadel, where its arrows can reach the road.' }))];
        if (stage === 'stones') return [opt('light-stones', 'What are these standing stones?', () => ({ line: 'Older than the village. Old Oren swears the signs at their bases tell you how to turn them.' }))];
        if (stage === 'defend') return [opt('light-defend', 'Will the wilds come for us?', () => ({ line: 'They will. Better that they come when we choose. Ring the bell by the Citadel when you are ready, not before.' }))];
        if (stage === 'report') return [opt('light-report', 'The wilds have been pushed back.', (world, mara) => {
          world.setStage('light', 'done');
          world.stock.gold += 75;
          world.awardExperience(40);
          world.adjustOpinion(mara, 20);
          world.addRumor(mara, 'helped');
          return { line: 'Then the light holds another season. Take this. And stay; there is more out there than one camp.', end: true };
        })];
      }
      if (npc.name === 'Iona' && stage === 'build') return [opt('light-iona', 'Mara says you have the tower plans.', () => ({
        line: 'I do. Keep them; I know them by heart. Unroll them anywhere you like, the plans show you what fits. Six timber and four stone for an archer tower, and a little coin for the fittings.',
      }))];
      return [];
    },
  },

  ledger: {
    id: 'ledger',
    title: "Tobin's Ledger",
    stages: {
      find: {
        journal: () => 'Tobin lost his ledger at the old mill on the northwest road. He wants it back, and quickly.',
        target: (w) => at(w.actors.find((a) => a.alive && a.itemType === 'ledger')) ?? { x: -44, z: 36 },
        update: (w) => ((w.pack.ledger ?? 0) > 0 ? 'decide' : undefined),
      },
      decide: {
        journal: (w) => w.flags.ledgerRead
          ? "I have Tobin's ledger. Inside, every new moon: payments to the southern camp for safe passage. Tobin wants it back. Vela would want to see it."
          : "I have Tobin's ledger. He wanted it back unread.",
        target: (w) => at(w.npc('Tobin')),
      },
    },
    talk: (w, npc, stage) => {
      if (npc.name === 'Tobin') {
        if (!stage) return [opt('ledger-start', 'You look distracted.', (world) => {
          world.startQuest('ledger', 'find');
          return { line: 'My ledger. Gone. I stopped at the old mill on the northwest road and must have set it down. If you find it, bring it straight to me. Straight to me, mind.' };
        })];
        if (stage === 'decide') {
          const options = [opt('ledger-return', 'Here is your ledger.', (world, tobin) => {
            world.takeFromPack('ledger', 1);
            world.stock.gold += 40;
            world.adjustOpinion(tobin, 20);
            world.flags.ledger = 'returned';
            world.setStage('ledger', 'done');
            return { line: 'Oh, thank the light. Here, for your trouble. And let us say no more about it.', end: true };
          })];
          if (w.flags.ledgerRead) options.push(opt('ledger-confront', 'Your ledger shows payments to the wild camp.', () => ({
            line: 'Keep your voice down. Yes. They leave my carts alone, and I pay. Without it the village goes hungry. Say nothing, and my prices will be kinder to you.',
            options: [
              opt('ledger-secret', "I'll keep your secret.", (world, tobin) => {
                world.takeFromPack('ledger', 1);
                world.flags.discount = true;
                world.flags.ledger = 'secret';
                world.adjustOpinion(tobin, 10);
                world.setStage('ledger', 'done');
                return { line: 'You are a reasonable sort. I will not forget it.', end: true };
              }),
              opt('ledger-warn', 'The wardens should know.', (world, tobin) => {
                world.flags.ledger = 'threatened';
                world.adjustOpinion(tobin, -30);
                return { line: 'Then go and tell them. See how fond the village is of empty shelves.', end: true };
              }),
            ],
          })));
          return options;
        }
      }
      if (npc.name === 'Vela' && stage === 'decide') return [opt('ledger-expose', "I found Tobin's ledger.", (world, vela) => {
        world.takeFromPack('ledger', 1);
        world.stock.gold += 30;
        world.standing += 5;
        world.adjustOpinion(vela, 20);
        const tobin = world.npc('Tobin');
        if (tobin) world.adjustOpinion(tobin, -40);
        world.addRumor(vela, 'ledger');
        world.flags.ledger = 'exposed';
        world.setStage('ledger', 'done');
        return { line: 'Paying the wilds. I knew it. The wardens will hear of this tonight. You did right.', end: true };
      })];
      return [];
    },
  },

  bread: {
    id: 'bread',
    title: 'Bread for the Watch',
    stages: {
      deliver: {
        journal: () => "Bran baked three loaves for Nell, who keeps the watch post on the south road. He doesn't mind how they get there.",
        target: (w) => at(w.actors.find((a) => a.kind === 'post')),
        update: (w) => {
          const post = w.actors.find((a) => a.kind === 'post');
          if (!post) return undefined;
          const loaves = w.actors.filter((a) => a.alive && a.itemType === 'bread' && !a.carriedBy && dist(a, post) < 3.5).length;
          if (loaves < 3) return undefined;
          w.flags.breadDelivered = true;
          return 'thanks';
        },
      },
      thanks: { journal: () => 'Nell has her bread. Bran will want to know.', target: (w) => at(w.npc('Bran')) },
    },
    talk: (w, npc, stage) => {
      if (npc.name === 'Bran') {
        if (!stage) return [opt('bread-start', 'Need a hand?', (world) => {
          const table = world.actors.find((a) => a.name === 'Bakery table');
          if (table) for (let i = 0; i < 3; i++) world.spawnItem('bread', table.x - 0.35 + i * 0.35, table.z + (i % 2 ? 0.2 : -0.15), table.surface ?? 0.9);
          world.startQuest('bread', 'deliver');
          return { line: 'Bless you. Nell has been at the watch post on the south road since dawn. Three loaves on my table there. Carry them, pack them, I do not care, just get them to her.' };
        })];
        if (stage === 'thanks') return [opt('bread-done', 'Nell has her bread.', (world, bran) => {
          world.stock.gold += 20;
          world.adjustOpinion(bran, 15);
          world.addRumor(bran, 'helped');
          world.setStage('bread', 'done');
          return { line: 'Good, good. Here. And come by the bakery whenever you like.', end: true };
        })];
      }
      if (npc.name === 'Nell' && stage === 'deliver' && (w.pack.bread ?? 0) >= 3) return [opt('bread-give', 'Bran sent bread.', (world) => {
        world.takeFromPack('bread', 3);
        world.setStage('bread', 'thanks');
        return { line: 'Oh, you saint. Tell Bran I owe him.', end: true };
      })];
      return [];
    },
  },

  road: {
    id: 'road',
    title: 'A Quiet Road',
    stages: {
      find: {
        journal: () => 'Alden wants eyes on the wild camp south of the watch post. Look, then report back.',
        target: (w) => at(w.camp),
        update: (w) => (dist(w.player, w.camp) < 16 ? 'report' : undefined),
      },
      report: { journal: () => 'I have seen the wild camp. Alden will want to hear what they are building.', target: (w) => at(w.npc('Alden')) },
    },
    talk: (_w, npc, stage) => {
      if (npc.name !== 'Alden') return [];
      if (!stage) return [opt('road-start', 'Does the watch need help?', (world) => {
        world.startQuest('road', 'find');
        return { line: 'Eyes, mostly. There is a wild camp past the watch post on the south road. Get close enough to see what they are building, then come back. Look, do not fight.' };
      })];
      if (stage === 'report') return [opt('road-report', 'I found their camp.', (world, alden) => {
        const camp = world.camp;
        const towers = world.actors.filter((a) => a.alive && a.kind === 'tower' && a.faction === 'wild').length;
        world.stock.gold += 35;
        world.adjustOpinion(alden, 15);
        world.setStage('road', 'done');
        const built = towers ? `${towers} watchtower${towers > 1 ? 's' : ''} already` : 'no towers yet';
        return { line: `Stockpiles of ${Math.round(camp.stockWood ?? 0)} timber and ${Math.round(camp.stockStone ?? 0)} stone, and ${built}? They are learning. Take this. And thank you.`, end: true };
      })];
      return [];
    },
  },

  echo: {
    id: 'echo',
    title: 'An Echo in the Grove',
    stages: {
      sound: {
        journal: (w) => `Three echo stones east of the village answer when struck. Lark says the grove sings dawn, leaf, star, and dawn again. (${w.echoProgress} of 4)`,
        target: (w) => at(w.actors.find((a) => a.kind === 'echo')),
        update: (w) => (w.echoSolved ? 'done' : undefined),
      },
    },
  },

  rescue: {
    id: 'rescue',
    title: 'A Favor Repaid',
    stages: {
      travel: {
        journal: (w, id) => {
          const data = w.quests[id]?.data;
          return data?.kind === 'rescue' ? `${data.captiveName} was taken to ${data.siteName}. ${data.approach} Find the entrance before the trail goes cold.` : 'Someone has gone missing beyond the village roads.';
        },
        target: (w, id) => {
          const data = w.quests[id]?.data;
          const anchor = data ? w.byId(data.siteActorId) : undefined;
          return anchor?.alive ? at(anchor) : data?.point;
        },
        update: (w, id) => {
          const data = w.quests[id]?.data;
          return data?.kind === 'rescue' && dist(w.player, data.point) < 8 ? 'free' : undefined;
        },
      },
      free: {
        journal: (w, id) => {
          const data = w.quests[id]?.data;
          return data?.kind === 'rescue' ? `${data.captiveName} is being held near ${data.siteName}. Get close enough to speak and free them.` : 'Find the captive and bring them home.';
        },
        target: (w, id) => {
          const data = w.quests[id]?.data;
          return at(data?.kind === 'rescue' ? w.byId(data.captiveId) : undefined);
        },
        update: (w, id) => w.quests[id]?.data?.kind === 'rescue' && w.quests[id].data.rescued ? 'report' : undefined,
      },
      report: {
        journal: (w, id) => {
          const data = w.quests[id]?.data;
          return data?.kind === 'rescue' ? `${data.captiveName} is safe and following you. Return to the person who asked for help.` : 'Return to the person who asked for help.';
        },
        target: (w, id) => at(w.byId(w.quests[id]?.data?.patronId ?? '')),
      },
    },
  },
  retrieve: {
    id: 'retrieve', title: 'A Lost Possession',
    stages: {
      travel: {
        journal: (w, id) => { const d = w.quests[id]?.data; return d?.kind === 'retrieve' ? `Find the ${d.itemName.toLowerCase()} lost at ${d.siteName}. The place was explored before, but someone has moved in.` : 'Find the missing item.'; },
        target: (w, id) => w.quests[id]?.data?.point,
        update: (w, id) => { const d = w.quests[id]?.data; return d?.kind === 'retrieve' ? d.recovered ? 'report' : dist(w.player, d.point) < 8 ? 'recover' : undefined : undefined; },
      },
      recover: {
        journal: (w, id) => { const d = w.quests[id]?.data; return d?.kind === 'retrieve' ? `The ${d.itemName.toLowerCase()} is somewhere near ${d.siteName}. Take it back to the person who lost it.` : 'Search the area.'; },
        target: (w, id) => { const d = w.quests[id]?.data; return d?.kind === 'retrieve' ? at(w.byId(d.itemActorId)) ?? d.point : undefined; },
        update: (w, id) => w.quests[id]?.data?.kind === 'retrieve' && w.quests[id].data.recovered ? 'report' : undefined,
      },
      report: {
        journal: (w, id) => { const d = w.quests[id]?.data; return d?.kind === 'retrieve' ? `I found the ${d.itemName.toLowerCase()}. Return it to ${w.byId(d.patronId)?.name ?? 'its owner'}.` : 'Return the item.'; },
        target: (w, id) => at(w.byId(w.quests[id]?.data?.patronId ?? '')),
      },
    },
  },
  hunt: {
    id: 'hunt', title: 'Trouble in the Wilds',
    stages: {
      travel: {
        journal: (w, id) => { const d = w.quests[id]?.data; return d?.kind === 'hunt' ? `A ${d.enemyName.toLowerCase()} is gathering fighters at ${d.siteName}. Find their position before they march.` : 'Find the raiders.'; },
        target: (w, id) => w.quests[id]?.data?.point,
        update: (w, id) => { const d = w.quests[id]?.data; return d?.kind === 'hunt' ? d.defeated ? 'report' : dist(w.player, d.point) < 10 ? 'defeat' : undefined : undefined; },
      },
      defeat: {
        journal: (w, id) => { const d = w.quests[id]?.data; return d?.kind === 'hunt' ? `Defeat the ${d.enemyName.toLowerCase()} and break the raid at ${d.siteName}.` : 'Defeat the raiders.'; },
        target: (w, id) => { const d = w.quests[id]?.data; return d?.kind === 'hunt' ? at(w.byId(d.enemyId)) ?? d.point : undefined; },
        update: (w, id) => w.quests[id]?.data?.kind === 'hunt' && w.quests[id].data.defeated ? 'report' : undefined,
      },
      report: {
        journal: (w, id) => { const d = w.quests[id]?.data; return d?.kind === 'hunt' ? `The ${d.enemyName.toLowerCase()} has fallen. Bring the news back.` : 'Report the victory.'; },
        target: (w, id) => at(w.byId(w.quests[id]?.data?.patronId ?? '')),
      },
    },
  },
};

function radiantOptions(w: SandboxWorld, npc: Actor): StoryOption[] {
  const options: StoryOption[] = [];
  for (const [id, quest] of w.radiantQuests()) {
    if (quest.status !== 'active' || !quest.data) continue;
    const d = quest.data;
    if (d.kind === 'rescue' && quest.stage === 'free' && npc.id === d.captiveId) {
      options.push(opt('rescue-free', 'I came to bring you home.', (world, captive) => {
        world.rescueCaptive(captive);
        return { line: `I knew you would come. Let us get back to ${world.byId(d.patronId)?.name ?? 'the village'}.`, end: true };
      }));
    }
    if (quest.stage !== 'report' || npc.id !== d.patronId) continue;
    if (d.kind === 'rescue') options.push(opt('rescue-report', `${d.captiveName} is safe.`, (world, patron) => {
      if (!world.finishRescueQuest(patron, id)) return { line: 'Bring them home safely first.' };
      return { line: `You brought ${d.captiveName} back. I will remember what you did for us.`, end: true };
    }));
    if (d.kind === 'retrieve') options.push(opt(`retrieve-report-${id}`, `I found your ${d.itemName.toLowerCase()}.`, (world, patron) => {
      if (!world.finishRetrieveQuest(id, patron)) return { line: 'It is not in your pack. Look for it again.' };
      return { line: 'You found it. I thought it was gone for good. Take this for your trouble.', end: true };
    }));
    if (d.kind === 'hunt') options.push(opt(`hunt-report-${id}`, `The ${d.enemyName.toLowerCase()} is gone.`, (world, patron) => {
      if (!world.finishHuntQuest(id, patron)) return { line: 'The threat is still out there.' };
      return { line: 'Good. The roads will be safer for a while. You have earned this.', end: true };
    }));
  }
  if (!w.hasActiveRadiantFor(npc.id)) {
    if (w.canGenerateRescue(npc)) options.push(opt('rescue-accept', 'Have you heard of anyone missing?', (world, patron) => {
      if (!world.generateRescueQuest(patron)) return { line: 'Not yet. We need a lead and a place you know.' };
      const d = world.quests[world.tracked]?.data;
      return { line: d?.kind === 'rescue' ? `${d.captiveName} was taken to ${d.siteName}. ${d.approach}` : 'Someone has gone missing.' };
    }));
    if (w.canGenerateRadiant(npc)) options.push(opt('radiant-accept', 'Is there work beyond the village?', (world, patron) => {
      const id = world.generateRadiantQuest(patron);
      const d = id ? world.quests[id]?.data : undefined;
      if (!d) return { line: 'Not yet. Explore and clear a place, then ask again.' };
      return { line: d.kind === 'rescue' ? `${d.captiveName} is missing near ${d.siteName}. Bring them home.`
        : d.kind === 'retrieve' ? `I lost my ${d.itemName.toLowerCase()} at ${d.siteName}. Find it and bring it back.`
          : `A ${d.enemyName.toLowerCase()} has taken ${d.siteName}. Break their band and report back.` };
    }));
  }
  return options;
}

const WORK: Record<string, string> = {
  Keeper: 'I keep the Citadel lit. When the wilds grow bold, the light is what they come for.',
  Merchant: 'Crowns for goods and goods for crowns. Spare timber? I will take it off your hands.',
  Warden: "Watch a brute's shoulders. When it rears back, step aside; it will hit nothing but air. And keep your hands off what isn't yours. Folk talk, and we listen.",
  Mason: 'Stone and timber, measured twice. A tower stands where you plan it, so plan it where it can see the road.',
  Woodcutter: 'Chop an old tree and the logs fall where they fall. They will wait for you there; wood is patient.',
  Herbalist: 'Woundwort for cuts. I leave some at the storehouse west of the square for anyone who needs it.',
  Farmer: 'The standing stones? Each has its sign cut low at the base. Turn the face until it matches. My grandfather showed me.',
  Forager: 'Nobody goes to the old mill on the northwest road any more. Something glints in there, though.',
  Apprentice: 'Mara is teaching me the light. Mostly I sweep.',
  Smith: 'That iron blade Tobin sells is mine. Worth every crown, and you will feel it.',
  Gardener: 'Everything here grows if you leave it be long enough. Even trouble.',
  Baker: 'Bread at dawn, bread at dusk. Tobin is my brother; he keeps the books, I keep the ovens. The watch eats more than anyone.',
  Scout: "Tobin's carts never get raided. Not once. Ever wonder why? I would love a look at that ledger of his.",
};

function newsFor(w: SandboxWorld, npc: Actor): string {
  const m = npc.memory!;
  const murder = m.rumors.find((r) => r.startsWith('murder:'));
  if (murder) return `${murder.slice(7)} was killed. Their family has put a price on the guardian's head. Keep your distance.`;
  const thief = m.rumors.find((r) => r.startsWith('thief:'));
  if (thief) return `Have you heard? ${thief.slice(6)} was caught stealing, bold as brass. The wardens fined them on the spot.`;
  if (m.rumors.includes('crime')) return "People are saying you've been taking what isn't yours. I hope that's just talk.";
  if (m.rumors.includes('ledger')) return 'Have you heard? Tobin has been paying the wilds. The whole square is talking.';
  if (m.rumors.includes('helped')) return 'Folk say you have been a real help around here. It is noticed.';
  if (npc.profession === 'Herbalist') {
    if (!w.quests.echo) w.startQuest('echo', 'sound');
    return 'East of the square there are three stones that ring like bells. The grove sings dawn, leaf, star, and dawn again. Strike them in that order and see what answers.';
  }
  if (w.actors.some((a) => a.alive && a.kind === 'tower' && a.faction === 'wild')) return 'Scouts say the wilds are putting up watchtowers now. Like they mean to stay.';
  if (w.hour() > 18) return 'Quiet evening. The kind that makes you suspicious.';
  return 'Nothing much. The wilds keep to the south, mostly.';
}

export function greetingFor(w: SandboxWorld, npc: Actor): string {
  const m = npc.memory!;
  const per = npc.persona;
  if (npc.activity === 'Sleeping') return 'Mm? It is the middle of the night. What is it?';
  if (m.alarmUntil > w.elapsed) return 'Stay back! I saw what you did.';
  if (m.opinion < -30) return per && per.temper < 0.35 ? 'What. Do. You. Want?' : 'What do you want?';
  if (per && per.kindness > 0.72 && m.opinion > 5) return 'Guardian. Always a welcome sight.';
  if (m.opinion >= 40) return 'There you are, friend. You know what is yours here; take only what you need.';
  if (per && per.greed > 0.75) return 'Guardian. Buying, or just looking?';
  const h = w.hour();
  const time = h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening';
  if (npc.name === 'Mara' && w.questStage('light') === 'meet') return 'There you are, guardian. Come, we need to talk.';
  if (m.opinion > 30) return `${time}, friend. Good to see you.`;
  return `${time}, guardian.`;
}

export function barkFor(w: SandboxWorld, npc: Actor): string {
  const m = npc.memory!;
  if (m.opinion < -30) return npc.persona && npc.persona.temper < 0.35 ? 'Hmph. Mind your hands.' : 'Hmph.';
  if (npc.persona && npc.persona.greed > 0.75) return 'Mind the prices are fair.';
  if (m.rumors.includes('helped')) return 'Thank you, guardian.';
  const h = w.hour();
  if (h >= 18) return 'Fine evening.';
  return h < 12 ? 'Morning.' : 'Light keep you.';
}

export function buildOptions(w: SandboxWorld, npc: Actor): StoryOption[] {
  const options: StoryOption[] = [];
  for (const def of Object.values(QUESTS)) {
    const state = w.quests[def.id];
    if (state?.status === 'done' || !def.talk) continue;
    options.push(...def.talk(w, npc, state?.stage));
  }
  options.push(...radiantOptions(w, npc));
  if (npc.profession === 'Merchant') options.push(opt('trade', 'Show me what you have.', (world) => ({
    line: world.flags.ledger === 'exposed' ? 'Buying or gloating? Either way, coin first.' : 'Have a look. Prices are fair; mostly.',
    shop: true,
  })));
  options.push(opt('work', 'What keeps you busy?', (_world, n) => ({ line: WORK[n.profession ?? ''] ?? 'This and that.' })));
  options.push(opt('news', 'Heard anything?', (world, n) => ({ line: newsFor(world, n) })));
  options.push(opt('bye', 'Farewell.', () => ({ line: 'Light keep you.', end: true })));
  return options;
}

export function confrontOptions(w: SandboxWorld): StoryOption[] {
  const fine = Math.ceil(w.bounty);
  const options: StoryOption[] = [];
  if (w.stock.gold >= fine) options.push(opt('fine', `Pay the fine (${fine} crowns).`, (world) => {
    world.stock.gold -= fine;
    world.bounty = 0;
    return { line: 'Good. Keep your hands to yourself from now on.', end: true };
  }));
  options.push(opt('quiet', "I'll come quietly.", (world) => {
    world.stock.gold = Math.max(0, world.stock.gold - Math.min(world.stock.gold, Math.ceil(fine / 2)));
    world.bounty = 0;
    world.respawnAtCitadel();
    return { line: 'A night in the Citadel cells and a lighter purse. Let that be the end of it.', end: true };
  }));
  options.push(opt('resist', 'You will have to stop me.', (world) => {
    world.hostileUntil = world.elapsed + 90;
    return { line: 'So be it.', end: true };
  }));
  return options;
}
