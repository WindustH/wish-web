// Resident history is already ordered. Sort only the arriving page, then merge
// in linear time; repeated sequence numbers replace their previous payload.
export function mergeHistory(resident, incoming) {
  if (!incoming.length) return resident;
  const page = [...new Map(incoming.map(item => [item.seq, item])).values()]
    .sort((a, b) => a.seq - b.seq);
  const merged = [];
  let i = 0, j = 0;
  while (i < resident.length && j < page.length) {
    if (resident[i].seq < page[j].seq) merged.push(resident[i++]);
    else {
      if (resident[i].seq === page[j].seq) i++;
      merged.push(page[j++]);
    }
  }
  while (i < resident.length) merged.push(resident[i++]);
  while (j < page.length) merged.push(page[j++]);
  return merged;
}
