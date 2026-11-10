import { writeFile } from 'node:fs/promises';

function makeTrack(object, property, points) {
  return { type: 'BasicKeyframedTrack', __debugName: `${object}:["${property}"]`, keyframes: points.map(([position, value], index) => ({
    id: `${property}-${index}`, position, connectedRight: true, handles: [0.5, 1, 0.5, 0], type: 'bezier', value,
  })) };
}
function makeObject(object, tracks) {
  const trackData = {}, trackIdByPropPath = {};
  for (const [property, points] of Object.entries(tracks)) {
    trackData[property] = makeTrack(object, property, points);
    trackIdByPropPath[JSON.stringify([property])] = property;
  }
  return { trackData, trackIdByPropPath };
}
function attack(windup, recovery, strength) {
  const length = windup + recovery;
  return {
    staticOverrides: { byObject: { Timing: { windup, recovery, shakeScale: strength } } },
    sequence: { subUnitsPerUnit: 60, length, type: 'PositionalSequence', tracksByObject: {
      Motion: makeObject('Motion', {
        windup: [[0, 0], [windup * 0.9, 1], [length, 0]],
        strike: [[0, 0], [windup * 0.9, 0], [windup + recovery * 0.42, 1], [length, 0]],
        effect: [[0, 0], [windup * 0.9, 0], [windup + 0.025, 1], [Math.min(length, windup + 0.16), 0], [length, 0]],
        shake: [[0, 0], [windup * 0.9, 0], [windup + 0.025, 1], [Math.min(length, windup + 0.16), 0], [length, 0]],
      }),
    } },
  };
}
const state = {
  definitionVersion: '0.4.0', revisionHistory: ['preserve-choreography-v1'],
  sheetsById: {
    'Attack One': attack(0.2, 0.28, 0.055),
    'Attack Two': attack(0.2, 0.28, 0.07),
    'Attack Three': attack(0.4, 0.32, 0.12),
    Recoil: {
      sequence: { subUnitsPerUnit: 60, length: 0.3, type: 'PositionalSequence', tracksByObject: {
        Motion: makeObject('Motion', { recoil: [[0, 0], [0.08, 1], [0.3, 0]] }),
      } },
    },
    Cinematic: {
      staticOverrides: { byObject: { Camera: { x: 14, y: 16, z: 18, targetY: 2 } } },
      sequence: { subUnitsPerUnit: 60, length: 3.2, type: 'PositionalSequence', tracksByObject: {
        Camera: makeObject('Camera', {
          x: [[0, 18], [3.2, 12]], y: [[0, 19], [3.2, 15]], z: [[0, 22], [3.2, 16]],
          weight: [[0, 0], [1, 1], [2.2, 1], [3.2, 0]],
          shake: [[0, 0], [1.25, 0], [1.5, 0.035], [2.1, 0], [3.2, 0]],
        }),
      } },
    },
  },
};
await writeFile('src/world/choreography.json', `${JSON.stringify(state, null, 2)}\n`);
console.log('Wrote the default Theatre.js project state.');