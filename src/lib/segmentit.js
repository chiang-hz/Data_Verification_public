// A simple dictionary implementation
class SimpleDict {
  constructor() {
    this.dict = {};
    this.max = 0;
  }
  add(word) {
    if (typeof word === "string" && word.length) {
      const len = word.length;
      this.dict[word] = true;
      if (len > this.max) {
        this.max = len;
      }
    }
    return this;
  }
  isWord(word) {
    return this.dict[word] === true;
  }
  get(len) {
    return len > this.max ? this.max : len;
  }
}

// Base class for segmentation
class Base {
  constructor() {
    this.dict = new SimpleDict();
  }
  use(dictionary) {
    for (const word in dictionary) {
      this.dict.add(word);
    }
  }
  getDict() {
    return this.dict;
  }
  doSegment(text, simple = false) {
    const words = [];
    // 使用正則表達式來處理多個空格和標點符號，更穩健
    text.split(/[\s\p{P}]+/u).forEach((part) => {
      if (!part) return; // 跳過因分割產生的空字串
      const segs = this.doSegmentMM(part);
      const nmmSegs = this.doSegmentNMM(segs);
      nmmSegs.forEach((seg) => words.push(seg));
    });
    return simple ? words : this.makenodes(words);
  }
  makenodes(words) {
    const nodes = [];
    for (let i = 0; i < words.length; i++) {
      const p = words[i].p || "un";
      nodes.push({ w: words[i], p: p });
    }
    return nodes;
  }
  doSegmentMM(text) {
    const words = [];
    for (let i = 0; i < text.length; ) {
      const word = this.getMM(text, i);
      words.push(word);
      i += word.length;
    }
    return words;
  }
  getMM(text, start) {
    let len = this.dict.get(text.length - start);
    if (len) {
      let word = text.substr(start, len);
      while (len > 1 && !this.dict.isWord(word)) {
        len--;
        word = text.substr(start, len);
      }
      return word;
    }
    return text.substr(start, 1);
  }
  doSegmentNMM(segs) {
    const words = [];
    for (let i = 0; i < segs.length; ) {
      let j;
      if (segs[i].length === 1 && this.isForeign(segs[i])) {
        for (
          j = i;
          j < segs.length && segs[j].length === 1 && this.isForeign(segs[j]);
          j++
        );
        // j會停在不滿足條件的元素上，所以slice要到j
        const newSegs = this.getNMM(segs.slice(i, j));
        newSegs.forEach((seg) => words.push(seg));
        i = j;
      } else {
        const newSegs = this.getNMM(segs.slice(i, i + 1));
        newSegs.forEach((seg) => words.push(seg));
        i++;
      }
    }
    return words;
  }
  getNMM(segs) {
    if (segs.length <= 1) return segs; // 如果只有一個或零個元素，直接返回
    const text = segs.join("");
    const firstWord = this.getMM(text, 0);
    const restOfText = text.substr(firstWord.length);
    if (!restOfText) {
      // 如果沒有剩餘文本，直接返回第一個詞
      return [firstWord];
    }
    // 【關鍵的最終修復】
    // 遞迴呼叫時，必須先將剩餘的字串重新斷詞成陣列，再傳遞給 getNMM
    const restSegs = this.getNMM(this.doSegmentMM(restOfText));
    return [firstWord, ...restSegs];
  }
  isForeign(word) {
    return /^[a-zA-Z0-9]$/.test(word);
  }
}

// Factory function to create new instances
function newInstance(options = {}) {
  const { use } = options;
  const instance = new Base();
  if (use) {
    instance.use(use);
  }
  return {
    doSegment: (text, opts = {}) => {
      const { simple = false, stripPunctuation = false } = opts;
      if (stripPunctuation) {
        text = text.replace(/[\p{P}\p{Z}]/gu, " ");
      }
      return instance.doSegment(text, simple);
    },
    use: (dict) => instance.use(dict),
  };
}

// Export the factory function
const segmentit = {
  new: newInstance,
};

export default segmentit;
