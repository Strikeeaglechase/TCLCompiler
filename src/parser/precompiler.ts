import { Stream } from "../stream.js";
import { Token, Tokenizer } from "./tokenizer.js";

class PreCompiler {
	private defines: { name: string; value: string; tokens: Token[] }[] = [];
	constructor(private input: string) {}

	public preTokenize(): Stream<string> {
		const definesExpr = this.input.matchAll(/#define (\w.*) (.*)/g);
		this.defines = [...definesExpr].map(d => {
			return {
				name: d[1],
				value: d[2],
				tokens: []
			};
		});

		this.tokenizeDefines();

		const output = this.input
			.trim()
			.split("\n")
			.filter(l => !l.startsWith("#"))
			.join("\n")
			.split("");

		return new Stream(output);
	}

	private accumulateTokens(stream: Stream<Token>): Token[] {
		const tokens: Token[] = [];
		while (!stream.eof()) tokens.push(stream.next());

		return tokens;
	}

	private tokenizeDefines() {
		this.defines.forEach(d => {
			const stream = new Stream(d.value.split(""));
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

export { PreCompiler };
