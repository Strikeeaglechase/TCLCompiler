import { Stream } from "../stream.js";
import { Token, Tokenizer } from "./tokenizer.js";

interface PosChar {
	char: string;
	line: number;
	column: number;
}

class PreCompiler {
	private defines: { name: string; value: string; tokens: Token[] }[] = [];
	constructor(private input: string) {}

	public preTokenize(): Stream<PosChar> {
		const definesExpr = this.input.matchAll(/#define (\w.*) (.*)/g);
		this.defines = [...definesExpr].map(d => {
			return {
				name: d[1],
				value: d[2],
				tokens: []
			};
		});

		this.tokenizeDefines();

		let currentLine = 1;
		let currentColumn = 1;
		const posChars = this.input.split("").map(c => {
			const posChar = {
				char: c,
				line: currentLine,
				column: currentColumn
			};

			if (c == "\n") {
				currentLine++;
				currentColumn = 1;
			} else currentColumn++;

			return posChar;
		});

		for (let i = 0; i < posChars.length; i++) {
			const cur = posChars[i];
			if (cur.char == "#") {
				let next = posChars[i + 1];
				while (next && next.char != "\n") {
					posChars.splice(i + 1, 1);
					next = posChars[i + 1];
				}
				posChars.splice(i, 1);
			}
		}

		return new Stream(posChars);
	}

	private accumulateTokens(stream: Stream<Token>): Token[] {
		const tokens: Token[] = [];
		while (!stream.eof()) tokens.push(stream.next());

		return tokens;
	}

	private tokenizeDefines() {
		this.defines.forEach(d => {
			const stream = new Stream<PosChar>(d.value.split("").map(c => ({ char: c, line: 0, column: 0 })));
			const tokenizer = new Tokenizer(stream);
			const tokens = tokenizer.parse();
			d.tokens = this.accumulateTokens(tokens);
		});
	}

	public postTokenize(stream: Stream<Token>): Stream<Token> {
		const output: Token[] = [];

		while (!stream.eof()) {
			const token = stream.next();
			if (token.type == "identifier") {
				const define = this.defines.find(d => d.name == token.value);
				if (define) {
					output.push(...define.tokens);
					continue;
				}
			}

			output.push(token);
		}

		return new Stream(output);
	}
}

export { PreCompiler, PosChar };
