/** A played card as the server lists it publicly, "suit_value", parsed into its face. */
export function parseCard(played: string): { suit: number; value: number } {
  const [suit, value] = played.split('_').map(Number);
  return { suit, value };
}
