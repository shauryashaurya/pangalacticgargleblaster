// constants.js

export const R = 32;
export const ARROW_SIZE = 8;

let _id = 0;
export const uid = () => `n${++_id}_${Date.now().toString(36)}`;
export const resetIdCounter = (val) => { _id = val || 0; };
