export const claims = [
  'Ashley depends on AI too much',
  'Ashley avoids finishing projects',
  'Ashley values systems over people',
  'Ashley prioritizes speed over quality',
  "Ashley's experience is too narrow",
  'Ashley resists standard practices',
];

function uniformRandomIndex(length: number): number {
  const limit = Math.floor(0x100000000 / length) * length;
  let value: number;
  do {
    value = crypto.getRandomValues(new Uint32Array(1))[0];
  } while (value >= limit);
  return value % length;
}

export function getRandomClaim(): string {
  return claims[uniformRandomIndex(claims.length)];
}
