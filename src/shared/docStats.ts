export interface DocStats {
  characters: number;
  charactersNoSpace: number;
  words: number;
  lines: number;
}

const WORD_REGEX = /[A-Za-z0-9_]+|[\u4e00-\u9fa5\u3040-\u30ff\u3400-\u4dbf]/g;

export function computeDocStats(input: string): DocStats {
  if (!input) {
    return { characters: 0, charactersNoSpace: 0, words: 0, lines: 0 };
  }

  const characters = input.length;
  let charactersNoSpace = 0;
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    if (code !== 32 && code !== 9 && code !== 10 && code !== 13) {
      charactersNoSpace += 1;
    }
  }

  const matches = input.match(WORD_REGEX);
  const words = matches ? matches.length : 0;
  const lines = input.split(/\r\n|\r|\n/).length;

  return { characters, charactersNoSpace, words, lines };
}
