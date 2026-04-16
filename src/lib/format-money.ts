/** Format integer pence (UK) as £x.xx */
export function formatPenceGBP(pence: number): string {
  const sign = pence < 0 ? "-" : "";
  const abs = Math.abs(pence);
  const pounds = Math.floor(abs / 100);
  const cents = abs % 100;
  return `${sign}£${pounds}.${cents.toString().padStart(2, "0")}`;
}
