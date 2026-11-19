export function findMatches(text, query, limit = 5000) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  const haystack = text.toLocaleLowerCase();
  const matches = [];
  let position = haystack.indexOf(needle);
  while (position >= 0 && matches.length < limit) {
    matches.push(position);
    position = haystack.indexOf(needle, position + Math.max(1, needle.length));
  }
  return matches;
}

export function renderHighlightedText(container, text, query, activePosition = -1, knownMatches = null) {
  const fragment = document.createDocumentFragment();
  const matches = knownMatches || findMatches(text, query);
  const queryLength = query.trim().length;
  let cursor = 0;
  matches.forEach((position) => {
    fragment.append(document.createTextNode(text.slice(cursor, position)));
    const mark = document.createElement("mark");
    mark.textContent = text.slice(position, position + queryLength);
    mark.dataset.position = String(position);
    if (position === activePosition) mark.classList.add("active-match");
    fragment.append(mark);
    cursor = position + queryLength;
  });
  fragment.append(document.createTextNode(text.slice(cursor)));
  container.replaceChildren(fragment);
  return matches;
}
