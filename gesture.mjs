const clamp = (n) => Math.max(0, Math.min(1, n));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export function openness(hand) {
  const palm = distance(hand[0], hand[9]);
  if (palm < .001) return 0;
  const fingers = [5, 9, 13, 17].map((joint) => {
    const reach = distance(hand[joint], hand[joint + 3]);
    const length = distance(hand[joint], hand[joint + 1])
      + distance(hand[joint + 1], hand[joint + 2])
      + distance(hand[joint + 2], hand[joint + 3]);
    return clamp((reach / Math.max(length, .001) - .42) / .52);
  });
  const thumb = clamp((distance(hand[4], hand[5]) / palm - .33) / .39);
  return clamp(((fingers.reduce((sum, n) => sum + n, 0) + thumb) / 5 - .12) / .80);
}
