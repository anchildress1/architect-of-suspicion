export const claims = [
  'Ashley depends on AI too much',
  'Ashley avoids finishing projects',
  'Ashley values systems over people',
  'Ashley prioritizes speed over quality',
  "Ashley's experience is too narrow",
  'Ashley resists standard practices',
];

export function getRandomClaim(): string {
  const index = crypto.getRandomValues(new Uint32Array(1))[0] % claims.length;
  return claims[index];
}
