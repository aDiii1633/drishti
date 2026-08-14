export function pageNumbers(totalPages: number) {
  return Array.from({ length: Math.max(0, totalPages) }, (_, index) => index + 1);
}
