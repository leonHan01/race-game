import type { BoardDefinition } from './vehicles';

/** Normalized top-view outlines shared by the catalogue and the 3D deck. */
const outlines: Record<BoardDefinition['shape'], readonly (readonly [number, number])[]> = {
  'drop-through': [[-.2,-.5],[.2,-.5],[.3,-.44],[.28,-.32],[.5,-.22],[.5,.22],[.28,.32],[.3,.44],[.2,.5],[-.2,.5],[-.3,.44],[-.28,.32],[-.5,.22],[-.5,-.22],[-.28,-.32],[-.3,-.44]],
  pintail: [[0,-.5],[.3,-.4],[.48,-.18],[.5,.12],[.36,.32],[.12,.45],[0,.5],[-.12,.45],[-.36,.32],[-.5,.12],[-.48,-.18],[-.3,-.4]],
  cutaway: [[-.22,-.5],[.22,-.5],[.22,-.31],[.5,-.28],[.5,.28],[.22,.31],[.22,.5],[-.22,.5],[-.22,.31],[-.5,.28],[-.5,-.28],[-.22,-.31]],
  race: [[-.27,-.5],[.27,-.5],[.5,-.35],[.5,.14],[.38,.38],[.19,.5],[-.19,.5],[-.38,.38],[-.5,.14],[-.5,-.35]],
};

export const boardOutline = (board: BoardDefinition) => outlines[board.shape].map(([x, z]) => [x * board.width, z * board.length] as const);
