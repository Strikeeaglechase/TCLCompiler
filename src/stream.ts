class Stream<T> {
	private index: number = 0;
	constructor(private items: T[]) {}

	next(): T {
		return this.items[this.index++];
	}

	peek(): T {
		return this.items[this.index];
	}

	// This being required feels bad
	peekOver(): T {
		return this.items[this.index + 1];
	}

	readUntil(value: T): T[] {
		const result: T[] = [];
		while (!this.eof() && this.peek() != value) {
			result.push(this.next());
		}

		this.next();
		return result;
	}

	skipUntil(value: T) {
		while (!this.eof() && this.next() != value) {}
	}

	eof(): boolean {
		return this.index >= this.items.length;
	}

	_all(): T[] {
		return this.items;
	}
}

export { Stream };
