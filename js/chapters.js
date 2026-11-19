const CN_NUM = "零〇一二三四五六七八九十百千万两壹贰叁肆伍陆柒捌玖拾佰仟";
const volumePattern = new RegExp(`^\\s*第\\s*([0-9${CN_NUM}]+)\\s*(卷|部|篇)\\s*[:：、.．\\-—]?\\s*(.*?)\\s*$`);
const chapterPattern = new RegExp(`^\\s*第\\s*([0-9${CN_NUM}]+)\\s*(章|回|节|话|幕|集)\\s*[:：、.．\\-—]?\\s*(.*?)\\s*$`);
const numberedPattern = new RegExp(`^\\s*([0-9${CN_NUM}]+)\\s*[、.．:：\\-—]\\s*(.*?)\\s*$`);
const paddedNumberPattern = /^\s*([0-9]{2,4})(?![0-9])\s*(.*?)\s*$/;
const setextNumberPattern = /^\s*\d+\s*$/;
const setextUnderlinePattern = /^\s*={6,}\s*$/;

function countCharacters(text) {
  return [...text.replace(/\s/g, "")].length;
}

export function matchHeading(line) {
  const candidate = line.trim();
  if (!candidate) return null;
  for (const marker of candidate.matchAll(/第/g)) {
    if (countCharacters(candidate.slice(0, marker.index)) >= 5) break;
    const heading = candidate.slice(marker.index);
    if (heading.length > 100) continue;
    if (volumePattern.test(heading)) return { level: 0, title: candidate };
    if (chapterPattern.test(heading)) return { level: 1, title: candidate };
  }
  if (countCharacters(candidate) < 10 && (numberedPattern.test(candidate) || paddedNumberPattern.test(candidate))) {
    return { level: 2, title: candidate };
  }
  return null;
}

export function matchSetextChapter(titleLine, underlineLine) {
  const title = titleLine.trim();
  return setextNumberPattern.test(title) && setextUnderlinePattern.test(underlineLine.trim())
    ? { level: 2, title }
    : null;
}

export function parseChapters(text) {
  const lines = text.match(/.*(?:\r\n|\n|\r|$)/g)?.filter(Boolean) ?? [];
  const chapters = [];
  let offset = 0;
  lines.forEach((line, index) => {
    const clean = line.replace(/[\r\n]+$/, "");
    const next = lines[index + 1]?.replace(/[\r\n]+$/, "") ?? "";
    const heading = matchHeading(clean) || matchSetextChapter(clean, next);
    if (heading) {
      const leading = clean.length - clean.trimStart().length;
      chapters.push({ ...heading, position: offset + leading });
    }
    offset += line.length;
  });
  return chapters;
}

export function formatNovelText(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return "";
  const output = [lines[0]];
  let index = 1;
  while (index < lines.length) {
    const line = lines[index];
    const setext = index + 1 < lines.length && matchSetextChapter(line, lines[index + 1]);
    if (matchHeading(line) || setext) {
      while (output.at(-1) === "") output.pop();
      output.push("", "", line);
      if (setext) {
        output.push(lines[index + 1]);
        index += 2;
        continue;
      }
    } else {
      if (output.at(-1) !== "") output.push("");
      output.push(`　　${line.replace(/^　+/, "")}`);
    }
    index += 1;
  }
  return `${output.join("\n")}\n`;
}
