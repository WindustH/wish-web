/** Tracks only contiguous native typing; moving the caret, IME or other edits invalidate it. */
export class ExitSequence {
  private prefix = '';
  private expected = '';
  private caret = -1;
  private last = 0;
  private configured = '';
  reset() {
    this.prefix = '';
    this.caret = -1;
  }
  press(
    key: string,
    text: string,
    start: number,
    end: number,
    sequence: string,
    interval: number,
    now: number,
  ): number {
    if (!sequence || key.length !== 1 || start !== end) {
      this.reset();
      return 0;
    }
    if (this.configured !== sequence || now - this.last > interval || text !== this.expected || start !== this.caret)
      this.reset();
    this.configured = sequence;
    this.prefix += key;
    while (this.prefix && !sequence.startsWith(this.prefix)) this.prefix = this.prefix.slice(1);
    if (!this.prefix) {
      this.reset();
      return 0;
    }
    if (this.prefix === sequence) {
      const count = this.prefix.length - 1;
      this.reset();
      return count;
    }
    this.expected = text.slice(0, start) + key + text.slice(end);
    this.caret = start + key.length;
    this.last = now;
    return 0;
  }
}
