// ─── WordNet-Gaeilge Semantic Network Query Module ──────────────────────────
// Parses and queries the Irish semantic network for semantically similar words.
// Uses wordnet-gaeilge-master data files from the repository.

/**
 * Format for wordnet synset database entries (from breis.noun/verb/adj/adv):
 * ID  DTYPE  POS  NUM  WORD1_LEMMA  0  WORD2_LEMMA  0  [POINTER_INFO...]  |  GLOSS
 * Pointers: @ (hypernym), ~ (similar), ;r (region), etc.
 */

interface SynsetEntry {
  id: string;
  pos: "n" | "v" | "a" | "r";  // noun, verb, adjective, adverb
  words: string[];
  pointers: Map<string, string[]>;  // relation type -> target synset IDs
  gloss: string;
}

export class WordNetGaeilge {
  private synsets: Map<string, SynsetEntry> = new Map();
  private wordIndex: Map<string, Set<string>> = new Map();  // word -> synset IDs
  private irishMappings: Map<string, string> = new Map();   // English word -> Irish translation
  private loaded = false;

  async loadDatabase(): Promise<void> {
    if (this.loaded) return;

    try {
      // Load all POS data files in parallel
      await Promise.all([
        this.loadPosFile("noun"),
        this.loadPosFile("verb"),
        this.loadPosFile("adj"),
        this.loadPosFile("adv"),
        this.loadIrishMappings(),
      ]);
      this.loaded = true;
    } catch (err) {
      console.error("Failed to load WordNet-Gaeilge database:", err);
      this.loaded = false;
    }
  }

  /**
   * Fetch semantically similar words for an English word.
   * Uses WordNet similarity relations to find synset neighbors.
   */
  async findSimilarWords(englishWord: string): Promise<Array<{ word: string; irish: string }>> {
    if (!this.loaded) await this.loadDatabase();
    if (!this.loaded) return [];

    const word = englishWord.toLowerCase().replace(/_/g, " ");
    const synsetIds = this.wordIndex.get(word);
    if (!synsetIds || synsetIds.size === 0) return [];

    const similar = new Set<string>();
    const maxResults = 5;

    // For each synset containing the word, find similar synsets
    for (const synsetId of synsetIds) {
      const synset = this.synsets.get(synsetId);
      if (!synset) continue;

      // Get similar synsets (~ relation)
      const similarSynsets = synset.pointers.get("~") || [];
      for (const similarId of similarSynsets) {
        const similarSynset = this.synsets.get(similarId);
        if (!similarSynset) continue;

        // Add all words from similar synset
        for (const w of similarSynset.words) {
          if (w.toLowerCase() !== word && similar.size < maxResults) {
            similar.add(w);
          }
        }
      }
    }

    // Map to Irish translations
    return Array.from(similar)
      .slice(0, maxResults)
      .map(w => ({
        word: w,
        irish: this.irishMappings.get(w.toLowerCase()) || w,
      }));
  }

  private async loadPosFile(pos: "noun" | "verb" | "adj" | "adv"): Promise<void> {
    const posCode = { noun: "n", verb: "v", adj: "a", adv: "r" }[pos] as "n" | "v" | "a" | "r";
    const filePath = `../wordnet-gaeilge-master/breis.${pos}`;

    try {
      const response = await fetch(filePath);
      if (!response.ok) {
        console.warn(`Could not load ${filePath}`, response.status);
        return;
      }

      const text = await response.text();
      const lines = text.split("\n");

      for (const line of lines) {
        if (!line.trim()) continue;
        this.parseSynsetLine(line, posCode);
      }
    } catch (err) {
      console.warn(`Error loading ${filePath}:`, err);
    }
  }

  private parseSynsetLine(line: string, pos: "n" | "v" | "a" | "r"): void {
    // Format: ID DTYPE POS NUM WORD1 0 WORD2 0 ... [POINTERS] | GLOSS
    const parts = line.split("|");
    if (parts.length !== 2) return;

    const [data, gloss] = parts;
    const tokens = data.trim().split(/\s+/);
    if (tokens.length < 4) return;

    const id = tokens[0];
    const numWords = parseInt(tokens[3], 16) || 0;

    // Extract words
    const words: string[] = [];
    let idx = 4;
    for (let i = 0; i < numWords && idx < tokens.length; i++, idx += 2) {
      const lemma = tokens[idx];
      if (lemma) {
        words.push(lemma.replace(/_/g, " "));
        // Index word -> synset
        const wordLower = lemma.toLowerCase();
        if (!this.wordIndex.has(wordLower)) {
          this.wordIndex.set(wordLower, new Set());
        }
        this.wordIndex.get(wordLower)!.add(id);
      }
    }

    // Extract pointers (remaining tokens before |)
    const pointers = new Map<string, string[]>();
    for (let i = idx; i < tokens.length; i++) {
      const token = tokens[i];
      // Pointer format: ~[i|!|+] SYNSET_ID POS
      if (token.match(/^[~@;]/)) {
        const relType = token[0];
        if (i + 1 < tokens.length) {
          const targetId = tokens[i + 1];
          if (!pointers.has(relType)) {
            pointers.set(relType, []);
          }
          pointers.get(relType)!.push(targetId);
          i += 2;  // Skip synset ID and POS
        }
      }
    }

    const synset: SynsetEntry = {
      id,
      pos,
      words,
      pointers,
      gloss: gloss.trim(),
    };

    this.synsets.set(id, synset);
  }

  private async loadIrishMappings(): Promise<void> {
    // Load Irish translations from po files
    // Format: msgctxt "synset_id pos"
    //         msgid "English definition"
    //         msgstr "Irish translation"
    const posTypes = [
      { file: "ga-data.noun.po", pos: "n" },
      { file: "ga-data.verb.po", pos: "v" },
      { file: "ga-data.adj.po", pos: "a" },
      { file: "ga-data.adv.po", pos: "r" },
    ];

    for (const { file, pos } of posTypes) {
      try {
        const response = await fetch(`../wordnet-gaeilge-master/${file}`);
        if (!response.ok) continue;

        const text = await response.text();
        this.parsePoFile(text, pos as "n" | "v" | "a" | "r");
      } catch (err) {
        console.warn(`Error loading ${file}:`, err);
      }
    }
  }

  private parsePoFile(content: string, pos: "n" | "v" | "a" | "r"): void {
    const msgctxtPattern = /msgctxt\s+"(\d+)\s+([nvar])"/;
    const msgidPattern = /msgid\s+"([^"]+)"/;
    const msgstrPattern = /msgstr\s+"([^"]+)"/;

    let currentSynset: string | null = null;
    let currentEnglish: string | null = null;

    const lines = content.split("\n");
    for (const line of lines) {
      const ctxtMatch = line.match(msgctxtPattern);
      if (ctxtMatch) {
        currentSynset = ctxtMatch[1];
        continue;
      }

      const idMatch = line.match(msgidPattern);
      if (idMatch) {
        currentEnglish = idMatch[1];
        continue;
      }

      const strMatch = line.match(msgstrPattern);
      if (strMatch && currentEnglish) {
        const irish = strMatch[1];
        // Map English words to Irish translation
        const words = currentEnglish.split(/\s+/).filter(w => w.length > 2);
        for (const word of words) {
          const key = word.toLowerCase();
          if (!this.irishMappings.has(key)) {
            this.irishMappings.set(key, irish);
          }
        }
        currentEnglish = null;
      }
    }
  }
}

// Singleton instance
let instance: WordNetGaeilge | null = null;

export function getWordNetGaeilge(): WordNetGaeilge {
  if (!instance) {
    instance = new WordNetGaeilge();
  }
  return instance;
}
